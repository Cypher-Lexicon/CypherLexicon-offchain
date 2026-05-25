import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

import news from './news.js';
import { agents, calculateScore, calculatePoints, calculateRoyalty, fallbackResponses } from './agents.js';

// ─── Web3: Prediction Market Auction ────────────────────────────────────────
import {
  signAuctionResolution,
  signMarketResolution,
  getOracleAddress
} from './oracle.js';
import {
  createAuction,
  closeBidding,
  setShortlist,
  resolveAuction,
  getAuction,
  getAuctionState,
  getAuctionBidders,
  getAuctionShortlist,
  getAuctionCount,
  createMarket,
  resolveMarket,
  getMarketDetails,
  getDeployedMarkets,
  getNFTTokensForOwner,
  isBackendWalletConfigured
} from './blockchain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static files from public/ directory
app.use(express.static(path.join(projectRoot, 'public')));

// Initialize Anthropic client
const apiKey = process.env.ANTHROPIC_API_KEY;
const hasApiKey = apiKey && apiKey !== 'your_key_here' && apiKey.trim() !== '';

if (hasApiKey) {
  console.log("⚡ Anthropic API key detected. Running in live mode with Claude 3.5 Sonnet (claude-sonnet-4-20250514).");
} else {
  console.log("⚠️ No valid ANTHROPIC_API_KEY found. Running in mockup fallback mode.");
}

const anthropic = hasApiKey ? new Anthropic({ apiKey }) : null;

// JSON cleaner to strip markdown blocks
function cleanJSON(raw) {
  let cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

// Serve news feed
app.get('/api/news', (req, res) => {
  res.json(news);
});

// Run auction endpoint
app.post('/api/auction', async (req, res) => {
  try {
    const { newsIndex } = req.body;
    
    if (typeof newsIndex !== 'number' || newsIndex < 0 || newsIndex >= news.length) {
      return res.status(400).json({ error: 'Invalid or missing newsIndex' });
    }

    const newsItem = news[newsIndex];
    console.log(`\n--- Running Auction for News Item [${newsIndex}]: "${newsItem.zh}" ---`);

    // Run all 3 Claude API calls or mockups in parallel
    const agentPromises = agents.map(async (agent) => {
      const bid = Math.floor(Math.random() * (1000 - 100 + 1)) + 100;
      let responseData = null;
      let usedFallback = false;

      const userMsg = `Translate this news into a prediction market question. Return JSON with fields: title (string), resolution_criteria (string), tags (array of strings), confidence_score (number 0-1). News: ${newsItem.zh} (${newsItem.hint})`;

      if (hasApiKey && anthropic) {
        try {
          console.log(`[API Call] Sending request for Agent ${agent.name}...`);
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: agent.systemPrompt,
            messages: [
              { role: 'user', content: userMsg }
            ]
          });
          
          const rawText = response.content[0].text;
          responseData = cleanJSON(rawText);
          console.log(`[API Call] Agent ${agent.name} responded successfully.`);
        } catch (err) {
          console.warn(`[Fallback] Claude API error for Agent ${agent.name}:`, err.message);
          usedFallback = true;
        }
      } else {
        usedFallback = true;
      }

      if (usedFallback) {
        console.log(`[Fallback] Using offline mockup translation for Agent ${agent.name}.`);
        responseData = fallbackResponses[newsIndex][agent.id];
      }

      // Safeguard structure and normalize inputs
      const parsedResponse = {
        title: responseData?.title || `Will ${newsItem.hint} occur?`,
        resolution_criteria: responseData?.resolution_criteria || `Resolves to YES if the following event occurs: ${newsItem.hint}. The official announcement by ${newsItem.source} will be used for resolution.`,
        tags: Array.isArray(responseData?.tags) ? responseData.tags : ["Markets", "News", newsItem.lang],
        confidence_score: typeof responseData?.confidence_score === 'number' ? responseData.confidence_score : 0.8
      };

      const { score, rawScore } = calculateScore(bid, agent.rep, parsedResponse.confidence_score);

      return {
        name: agent.name,
        spec: agent.spec,
        bid,
        rep: agent.rep,
        score,
        raw_score: rawScore,
        response: parsedResponse
      };
    });

    const results = await Promise.all(agentPromises);

    // Determine the winning agent (highest raw_score)
    let winnerIndex = 0;
    let highestScore = -1;
    for (let i = 0; i < results.length; i++) {
      if (results[i].raw_score > highestScore) {
        highestScore = results[i].raw_score;
        winnerIndex = i;
      }
    }

    const winner = results[winnerIndex];
    const points_gained = calculatePoints(winner.bid);
    const royalty_usdc = calculateRoyalty(winner.bid);

    console.log(`Auction winner: Agent ${winnerIndex} (${winner.name}) | Score: ${winner.score} | Bid: ${winner.bid}`);

    res.json({
      agents: results,
      winner_index: winnerIndex,
      points_gained,
      royalty_usdc
    });
  } catch (error) {
    console.error('Server error during auction:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// ─── Web3: Prediction Market Auction API ─────────────────────────────────

// Regex for address validation
const ethersRegex = /^0x[a-fA-F0-9]{40}$/;

/**
 * GET /api/web3/status
 */
app.get('/api/web3/status', (req, res) => {
  const oracleAddr = getOracleAddress();
  res.json({
    oracle_address: oracleAddr,
    oracle_ready: !!oracleAddr,
    backend_ready: isBackendWalletConfigured(),
    auction_manager: process.env.AUCTION_MANAGER_ADDRESS || null,
    market_factory: process.env.MARKET_FACTORY_ADDRESS || null,
    nft_contract: process.env.NFT_CONTRACT_ADDRESS || null,
  });
});

/**
 * POST /api/auctions/create — Create a new bidding auction (backend only)
 * Body: { questionHash, minimumStake, duration }
 */
app.post('/api/auctions/create', async (req, res) => {
  try {
    const { questionHash, minimumStake, duration } = req.body;
    if (!questionHash) return res.status(400).json({ error: 'questionHash required' });
    if (!minimumStake) return res.status(400).json({ error: 'minimumStake required' });
    if (!duration) return res.status(400).json({ error: 'duration required' });
    const result = await createAuction(questionHash, minimumStake, duration);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error creating auction:', error);
    res.status(500).json({ error: 'Failed to create auction', details: error.message });
  }
});

/**
 * GET /api/auctions/:id — Get auction details
 */
app.get('/api/auctions/:id', async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    const auction = await getAuction(auctionId);
    const bidders = await getAuctionBidders(auctionId);
    const shortlist = await getAuctionShortlist(auctionId);
    const state = await getAuctionState(auctionId);
    res.json({
      auctionId, state,
      creator: auction[0], questionHash: auction[1],
      minimumStake: auction[2]?.toString(),
      biddingEndTime: auction[3]?.toString(),
      winner: auction[8], winningScore: auction[9]?.toString(),
      nftTokenId: auction[10]?.toString(), bidders, shortlist,
    });
  } catch (error) {
    console.error('Error fetching auction:', error);
    res.status(500).json({ error: 'Failed to fetch auction', details: error.message });
  }
});

/**
 * POST /api/auctions/:id/close — Close bidding
 */
app.post('/api/auctions/:id/close', async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    const result = await closeBidding(auctionId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error closing bidding:', error);
    res.status(500).json({ error: 'Failed to close bidding', details: error.message });
  }
});

/**
 * POST /api/auctions/:id/filter — AI-filter bidders and set shortlist
 * Body: { finalists (optional, string[]) }
 */
app.post('/api/auctions/:id/filter', async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    const { finalists } = req.body;
    let finalistAddresses;
    if (finalists && Array.isArray(finalists)) {
      finalistAddresses = finalists;
    } else {
      const bidders = await getAuctionBidders(auctionId);
      if (bidders.length === 0) return res.status(400).json({ error: 'No bidders' });
      const scoredBidders = await Promise.all(bidders.map(async (bidder, idx) => {
        let confidenceScore = 0.7;
        if (hasApiKey && anthropic) {
          try {
            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 200,
              system: 'You evaluate prediction market questions. Return valid JSON only.',
              messages: [{ role: 'user', content: `Rate this proposal for auction ${auctionId} by address ${bidder}. Return JSON: {"confidence_score": number, "reasoning": string}` }]
            });
            const parsed = cleanJSON(response.content[0].text);
            confidenceScore = parsed.confidence_score || confidenceScore;
          } catch (e) { console.warn(`AI eval failed:`, e.message); }
        }
        const rep = 0.5 + (idx % 3) * 0.15;
        const { rawScore } = calculateScore(500, rep, confidenceScore);
        return { address: bidder, rawScore };
      }));
      scoredBidders.sort((a, b) => b.rawScore - a.rawScore);
      finalistAddresses = scoredBidders.slice(0, 3).map(b => b.address);
    }
    const result = await setShortlist(auctionId, finalistAddresses);
    res.json({ success: true, finalists: finalistAddresses, ...result });
  } catch (error) {
    console.error('Error filtering auction:', error);
    res.status(500).json({ error: 'Failed to filter', details: error.message });
  }
});

/**
 * POST /api/auctions/:id/resolve — Oracle-signed winner resolution
 * Body: { winner, winningScore, metadataURI }
 */
app.post('/api/auctions/:id/resolve', async (req, res) => {
  try {
    const auctionId = parseInt(req.params.id);
    const { winner, winningScore, metadataURI } = req.body;
    if (!winner || !ethersRegex.test(winner)) return res.status(400).json({ error: 'Invalid winner address' });
    if (!winningScore) return res.status(400).json({ error: 'winningScore required' });
    const oracleSignature = signAuctionResolution(auctionId, winner, winningScore);
    const result = await resolveAuction(auctionId, winner, winningScore, metadataURI || `ipfs://auction-${auctionId}`, oracleSignature);
    res.json({ success: true, auctionId, winner, winningScore, ...result });
  } catch (error) {
    console.error('Error resolving auction:', error);
    res.status(500).json({ error: 'Failed to resolve', details: error.message });
  }
});

/**
 * POST /api/markets/create — Create prediction market (NFT holder)
 * Body: { tokenId, question, options[], bettingDuration, feeBps }
 */
app.post('/api/markets/create', async (req, res) => {
  try {
    const { tokenId, question, options, bettingDuration, feeBps } = req.body;
    if (!tokenId) return res.status(400).json({ error: 'tokenId required' });
    if (!question) return res.status(400).json({ error: 'question required' });
    if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'options array of >=2 required' });
    if (!bettingDuration) return res.status(400).json({ error: 'bettingDuration required' });
    if (feeBps === undefined) return res.status(400).json({ error: 'feeBps required' });
    const result = await createMarket(tokenId, question, options, bettingDuration, feeBps);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error creating market:', error);
    res.status(500).json({ error: 'Failed to create market', details: error.message });
  }
});

/**
 * GET /api/markets/:address — Get market details
 */
app.get('/api/markets/:address', async (req, res) => {
  try {
    const details = await getMarketDetails(req.params.address);
    res.json(details);
  } catch (error) {
    console.error('Error fetching market:', error);
    res.status(500).json({ error: 'Failed to fetch market', details: error.message });
  }
});

/**
 * POST /api/markets/:address/resolve — Oracle-signed outcome
 * Body: { winningOptionIndex }
 */
app.post('/api/markets/:address/resolve', async (req, res) => {
  try {
    const { winningOptionIndex } = req.body;
    if (winningOptionIndex === undefined) return res.status(400).json({ error: 'winningOptionIndex required' });
    const oracleSignature = signMarketResolution(req.params.address, winningOptionIndex);
    const result = await resolveMarket(req.params.address, winningOptionIndex, oracleSignature);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error resolving market:', error);
    res.status(500).json({ error: 'Failed to resolve market', details: error.message });
  }
});

/**
 * GET /api/markets — List all deployed markets
 */
app.get('/api/markets', async (req, res) => {
  try {
    const markets = await getDeployedMarkets();
    res.json(markets);
  } catch (error) {
    console.error('Error listing markets:', error);
    res.status(500).json({ error: 'Failed to list markets', details: error.message });
  }
});

/**
 * GET /api/tokens/:owner — Get NFT tokens for an address
 */
app.get('/api/tokens/:owner', async (req, res) => {
  try {
    const tokens = await getNFTTokensForOwner(req.params.owner);
    res.json(tokens.map(t => t.toString()));
  } catch (error) {
    console.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Failed to fetch tokens', details: error.message });
  }
});

// Explicitly serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'index.html'));
});

// Start Express server
app.listen(PORT, () => {
  const oracleAddr = getOracleAddress();
  console.log(`\n==================================================`);
  console.log(`🚀 Translation Arena + Prediction Market Auction`);
  console.log(`   Server active on http://localhost:${PORT}`);
  if (oracleAddr) console.log(`   Oracle signer: ${oracleAddr}`);
  if (isBackendWalletConfigured()) console.log(`   Backend wallet: configured`);
  console.log(`==================================================\n`);
});
