/**
 * auction/routes.js — Auction API Routes (backend/auction)
 *
 * Endpoints for the AUCTION phase:
 *   POST /api/auctions/create  — Create a new auction (operator-only)
 *   GET  /api/auctions/:id     — Get auction details (with decoded proposals)
 *   GET  /api/auctions/by-token/:tokenId — Get auction by NFT token ID
 *   POST /api/auctions/:id/close   — Close bidding (manual)
 *   POST /api/auctions/:id/filter  — Two-stage filter + set shortlist
 *   POST /api/auctions/:id/evaluate — Heuristic evaluation of finalists
 *   POST /api/auctions/:id/resolve  — Oracle-signed resolution
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  signAuctionResolution,
} from '../core/oracle.js';
import {
  createAuction,
  closeBidding,
  setShortlist,
  resolveAuction,
  getAuction,
  getAuctionState,
  getAuctionBidders,
  getAuctionShortlist,
  getBidderProposal,
  getAuctionCount,
} from '../core/blockchain.js';
import { calculateScore } from '../core/agents.js';
import { encodeProposal, decodeProposal, heuristicScore, preFilterProposals } from './service.js';

const ethersRegex = /^0x[a-fA-F0-9]{40}$/;
const apiKey = process.env.ANTHROPIC_API_KEY;
const hasApiKey = apiKey && apiKey !== 'your_key_here' && apiKey.trim() !== '';
const anthropic = hasApiKey ? new Anthropic({ apiKey }) : null;

// In-memory stores
const _auctionFinalists = {};
const _tokenToAuction = {}; // tokenId → auctionId mapping

function cleanJSON(raw) {
  let cleaned = raw.replace(/```(?:json)?/gi, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned);
}

function isOperator(address) {
  if (!address || !ethersRegex.test(address)) return false;
  const raw = process.env.OPERATOR_ADDRESSES || '';
  const operators = raw.split(',').map(a => a.trim().toLowerCase()).filter(a => ethersRegex.test(a));
  return operators.includes(address.toLowerCase());
}

export function registerAuctionRoutes(app) {

  /**
   * GET /api/auctions — List all auctions with summary info
   * Public — anyone can view the auction list.
   */
  app.get('/api/auctions', async (req, res) => {
    try {
      const count = parseInt(await getAuctionCount());
      const auctions = [];

      for (let i = 1; i <= count; i++) {
        try {
          const auction = await getAuction(i);
          const stateVal = await getAuctionState(i);
          const bidders = await getAuctionBidders(i);

          // Decode questionHash for display
          let question = auction[1];
          let description = '';
          let options = [];
          let resolutionDate = '';
          try {
            const parsed = JSON.parse(auction[1]);
            if (parsed.q) {
              question = parsed.q;
              description = parsed.d || '';
              options = parsed.o || [];
              resolutionDate = parsed.r || '';
            }
          } catch (e) { /* legacy format or OPEN_AUCTION placeholder */ }

          // If the auction uses the placeholder (questions proposed by bidders)
          if (question === 'OPEN_AUCTION') {
            question = '';
          }

          const winner = auction[7];
          const hasWinner = winner && winner !== '0x0000000000000000000000000000000000000000';

          auctions.push({
            auctionId: i,
            state: stateVal,
            question,
            description,
            options,
            resolutionDate,
            minimumStake: auction[2]?.toString(),
            biddingEndTime: auction[3]?.toString(),
            bidderCount: bidders.length,
            winner: hasWinner ? winner : null,
            nftTokenId: auction[9]?.toString(),
            isComplete: stateVal === 'COMPLETED',
            isActive: stateVal === 'BIDDING_OPEN',
          });
        } catch (e) {
          console.warn(`Error fetching auction #${i}:`, e.message);
        }
      }

      res.json({ auctions });
    } catch (error) {
      console.error('Error listing auctions:', error);
      res.status(500).json({ error: 'Failed to list auctions', details: error.message });
    }
  });

  /**
   * POST /api/auctions/create — Operator-only auction creation
   * Body: { minimumStake, duration, operatorAddress }
   * The operator only sets the economic parameters. Bidders propose the question.
   */
  app.post('/api/auctions/create', async (req, res) => {
    try {
      const { minimumStake, duration, operatorAddress } = req.body;

      // Operator gating
      if (!isOperator(operatorAddress)) {
        return res.status(403).json({ error: 'Not authorized. Only whitelisted operators can create auctions.' });
      }

      if (!minimumStake) return res.status(400).json({ error: 'minimumStake required' });
      if (!duration) return res.status(400).json({ error: 'duration required' });

      // Placeholder — questions are proposed by bidders when they placeBid
      const questionHash = 'OPEN_AUCTION';

      const result = await createAuction(questionHash, minimumStake, duration);
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error('Error creating auction:', error);
      res.status(500).json({ error: 'Failed to create auction', details: error.message });
    }
  });

  /**
   * GET /api/auctions/by-token/:tokenId — Find auction by NFT token ID
   * Used by the market tab to auto-populate market creation from winning bid data.
   */
  app.get('/api/auctions/by-token/:tokenId', async (req, res) => {
    try {
      const tokenId = parseInt(req.params.tokenId);
      if (isNaN(tokenId)) return res.status(400).json({ error: 'Invalid token ID' });

      // Check in-memory map first
      const auctionId = _tokenToAuction[tokenId];
      if (auctionId) {
        const auction = await getAuction(auctionId);
        const bidders = await getAuctionBidders(auctionId);
        const winner = auction[7];

        // Find winner's proposal
        let winnerProposal = { question: auction[1], description: '', options: [], resolutionDate: '' };
        if (winner && winner !== '0x0000000000000000000000000000000000000000') {
          try {
            const proposalRaw = await getBidderProposal(auctionId, winner);
            const decoded = decodeProposal(proposalRaw);
            winnerProposal = decoded;
          } catch (e) {}
        }

        // Also try to decode the auction's questionHash
        try {
          const parsed = JSON.parse(auction[1]);
          if (parsed.q) {
            winnerProposal.question = winnerProposal.question || parsed.q;
            winnerProposal.description = winnerProposal.description || parsed.d || '';
            winnerProposal.options = winnerProposal.options.length ? winnerProposal.options : (parsed.o || []);
            winnerProposal.resolutionDate = winnerProposal.resolutionDate || parsed.r || '';
          }
        } catch (e) {}

        return res.json({
          tokenId, auctionId, winner,
          question: winnerProposal.question,
          description: winnerProposal.description,
          options: winnerProposal.options,
          resolutionDate: winnerProposal.resolutionDate,
        });
      }

      // Fallback: scan auctions for matching token
      const count = await getAuctionCount();
      for (let i = 1; i <= count; i++) {
        try {
          const auction = await getAuction(i);
          if (auction[9] && auction[9].toString() === String(tokenId)) {
            _tokenToAuction[tokenId] = i;
            const bidders = await getAuctionBidders(i);
            const winner = auction[7];
            let winnerProposal = { question: auction[1], description: '', options: [], resolutionDate: '' };

            if (winner && winner !== '0x0000000000000000000000000000000000000000') {
              try {
                const proposalRaw = await getBidderProposal(i, winner);
                const decoded = decodeProposal(proposalRaw);
                winnerProposal = decoded;
              } catch (e) {}
            }

            try {
              const parsed = JSON.parse(auction[1]);
              if (parsed.q) {
                winnerProposal.question = winnerProposal.question || parsed.q;
                winnerProposal.description = winnerProposal.description || parsed.d || '';
                winnerProposal.options = winnerProposal.options.length ? winnerProposal.options : (parsed.o || []);
                winnerProposal.resolutionDate = winnerProposal.resolutionDate || parsed.r || '';
              }
            } catch (e) {}

            return res.json({
              tokenId, auctionId: i, winner,
              question: winnerProposal.question,
              description: winnerProposal.description,
              options: winnerProposal.options,
              resolutionDate: winnerProposal.resolutionDate,
            });
          }
        } catch (e) { continue; }
      }

      res.status(404).json({ error: 'No auction found for this token ID' });
    } catch (error) {
      console.error('Error finding auction by token:', error);
      res.status(500).json({ error: 'Failed to find auction', details: error.message });
    }
  });

  /**
   * GET /api/auctions/:id — Get auction details with decoded proposals
   */
  app.get('/api/auctions/:id', async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const auction = await getAuction(auctionId);
      const bidders = await getAuctionBidders(auctionId);
      const shortlist = await getAuctionShortlist(auctionId);
      const state = await getAuctionState(auctionId);

      // Decode the questionHash
      let questionMeta = { question: auction[1], description: '', options: [], resolutionDate: '' };
      try {
        const parsed = JSON.parse(auction[1]);
        if (parsed.q) {
          questionMeta = { question: parsed.q, description: parsed.d || '', options: parsed.o || [], resolutionDate: parsed.r || '' };
        }
      } catch (e) { /* legacy format */ }

      // Decode bidder proposals
      const bidderDetails = await Promise.all(bidders.map(async (addr) => {
        let proposalRaw = '';
        try { proposalRaw = await getBidderProposal(auctionId, addr); } catch (e) { }
        const decoded = decodeProposal(proposalRaw);
        return { address: addr, ...decoded };
      }));

      res.json({
        auctionId, state,
        creator: auction[0],
        question: questionMeta.question,
        description: questionMeta.description,
        options: questionMeta.options,
        resolutionDate: questionMeta.resolutionDate,
        minimumStake: auction[2]?.toString(),
        biddingEndTime: auction[3]?.toString(),
        winner: auction[7],
        winningScore: auction[8]?.toString(),
        nftTokenId: auction[9]?.toString(),
        bidders: bidderDetails,
        shortlist,
      });
    } catch (error) {
      console.error('Error fetching auction:', error);
      res.status(500).json({ error: 'Failed to fetch auction', details: error.message });
    }
  });

  /**
   * POST /api/auctions/:id/close — Manually close bidding
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
   * POST /api/auctions/:id/filter — Two-stage filter: pre-filter -> AI batch eval -> set shortlist
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

        const proposalsArr = await Promise.all(bidders.map(async (bidder, idx) => {
          let proposal = '';
          try { proposal = await getBidderProposal(auctionId, bidder); } catch (e) { }
          return { index: idx, address: bidder, proposal };
        }));

        // Stage 1: Pre-filter
        const preFiltered = preFilterProposals(proposalsArr, 0.20, 50);
        if (preFiltered.length === 0) {
          return res.status(400).json({ error: 'No proposals passed the relevance pre-filter.' });
        }

        // Stage 2: AI batch evaluation
        let confidenceScores = {};
        preFiltered.forEach(p => { confidenceScores[p.index] = p.hScore; });

        if (hasApiKey && anthropic) {
          try {
            const proposalsList = preFiltered
              .map(p => `[${p.index}] ${p.address.slice(0, 10)}... — proposal`)
              .join('\n');

            const response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 1024,
              system: 'You evaluate prediction market proposals for quality and clarity. Rank them. Return valid JSON only.',
              messages: [{ role: 'user', content: `Evaluate and rank these ${preFiltered.length} proposals. Score clarity, specificity, market viability. Return JSON: {"scores": [{"index": 0, "confidence_score": 0.0-1.0, "reasoning": "..."}, ...]}\n\n${proposalsList}` }]
            });
            const parsed = cleanJSON(response.content[0].text);
            if (parsed.scores && Array.isArray(parsed.scores)) {
              for (const s of parsed.scores) {
                if (typeof s.index === 'number') {
                  const h = confidenceScores[s.index] || 0.5;
                  const ai = typeof s.confidence_score === 'number' ? s.confidence_score : 0.5;
                  confidenceScores[s.index] = (h * 0.5) + (ai * 0.5);
                }
              }
            }
          } catch (e) { console.warn('[Batch Eval] Claude failed, using heuristic scores only:', e.message); }
        }

        // Reduce to <=3 finalists
        const scoredBidders = preFiltered.map(p => {
          const rep = 0.5 + (p.index % 3) * 0.15;
          const conf = confidenceScores[p.index] || p.hScore || 0.5;
          const { rawScore } = calculateScore(500, rep, conf);
          return { address: p.address, rawScore, proposal: p.proposal, hScore: p.hScore, aiScore: conf };
        });
        scoredBidders.sort((a, b) => b.rawScore - a.rawScore);
        const top3 = scoredBidders.slice(0, 3);
        finalistAddresses = top3.map(b => b.address);

        _auctionFinalists[auctionId] = top3.map(f => ({
          address: f.address, proposal: f.proposal, filterScore: f.rawScore
        }));
      }

      const result = await setShortlist(auctionId, finalistAddresses);
      res.json({ success: true, finalists: finalistAddresses, ...result });
    } catch (error) {
      console.error('Error filtering auction:', error);
      res.status(500).json({ error: 'Failed to filter', details: error.message });
    }
  });

  /**
   * POST /api/auctions/:id/evaluate — Heuristic evaluation of shortlisted finalists
   */
  app.post('/api/auctions/:id/evaluate', async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const shortlist = await getAuctionShortlist(auctionId);
      if (!shortlist || shortlist.length === 0) {
        return res.status(400).json({ error: 'No shortlist found. Run filter first.' });
      }

      const finalists = await Promise.all(shortlist.map(async (addr, idx) => {
        let proposal = '';
        try { proposal = await getBidderProposal(auctionId, addr); } catch (e) { }
        const cached = _auctionFinalists[auctionId]?.find(f => f.address === addr);
        return { address: addr, proposal: proposal || cached?.proposal || `Finalist #${idx}` };
      }));

      const scored = finalists.map(f => ({
        address: f.address,
        proposal: f.proposal,
        score: heuristicScore(f.proposal)
      }));
      scored.sort((a, b) => b.score - a.score);

      const winner = scored[0];
      const winningScore = Math.round(winner.score * 10000);

      console.log(`[HeuristicEval] Winner: ${winner.address.slice(0, 10)}... score=${winner.score.toFixed(3)}`);

      // Store for resolve step
      _auctionEvalResults[auctionId] = { winner: winner.address, winningScore };

      res.json({
        success: true, auctionId, method: 'heuristic',
        finalistCount: finalists.length,
        scores: scored.map(s => ({
          address: s.address, score: s.score, proposal: s.proposal.substring(0, 100)
        })),
        winner: { address: winner.address, score: winner.score, proposal: winner.proposal, winningScore }
      });
    } catch (error) {
      console.error('Error evaluating:', error);
      res.status(500).json({ error: 'Failed to evaluate', details: error.message });
    }
  });

  /**
   * POST /api/auctions/:id/resolve — Oracle-signed winner resolution
   */
  app.post('/api/auctions/:id/resolve', async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      let { winner, winningScore, metadataURI } = req.body;

      // Auto-fill from evaluation if not provided
      if ((!winner || !winningScore) && _auctionEvalResults[auctionId]) {
        const cached = _auctionEvalResults[auctionId];
        winner = winner || cached.winner;
        winningScore = winningScore || cached.winningScore;
      }

      if (!winner || !ethersRegex.test(winner)) return res.status(400).json({ error: 'Invalid winner address' });
      if (!winningScore) return res.status(400).json({ error: 'winningScore required' });

      const oracleSignature = signAuctionResolution(auctionId, winner, winningScore);
      const result = await resolveAuction(auctionId, winner, winningScore, metadataURI || `ipfs://auction-${auctionId}`, oracleSignature);

      // Fetch auction to get the nftTokenId for winner-to-market mapping
      try {
        const resolvedAuction = await getAuction(auctionId);
        if (resolvedAuction[9]) {
          const tokenId = resolvedAuction[9].toString();
          _tokenToAuction[tokenId] = auctionId;
        }
      } catch (e) { console.warn('Could not fetch auction after resolution:', e.message); }

      // Clean up
      delete _auctionEvalResults[auctionId];
      delete _auctionFinalists[auctionId];

      res.json({ success: true, auctionId, winner, winningScore, ...result });
    } catch (error) {
      console.error('Error resolving auction:', error);
      res.status(500).json({ error: 'Failed to resolve', details: error.message });
    }
  });
}

const _auctionEvalResults = {};
