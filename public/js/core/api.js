/**
 * api.js — Backend API Client
 * 
 * Wraps all fetch calls to the Express server endpoints.
 * All functions return parsed JSON or throw on error.
 */

const API = {

  // ─── Web3 Status ───────────────────────────────────────────

  /** Get oracle + backend wallet readiness */
  async getWeb3Status() {
    const res = await fetch('/api/web3/status');
    if (!res.ok) throw new Error(`Web3 status failed: ${res.status}`);
    return res.json();
  },

  // ─── Operator Auth ─────────────────────────────────────────

  /** Check if an address is a whitelisted operator */
  async checkOperator(address) {
    const res = await fetch(`/api/auth/operator/${address}`);
    if (!res.ok) throw new Error(`Operator check failed: ${res.status}`);
    return res.json();
  },

  // ─── On-Chain Auction (Phase 1) ────────────────────────────

  /** List all auctions with summary info */
  async listAuctions() {
    const res = await fetch('/api/auctions');
    if (!res.ok) throw new Error(`List auctions failed: ${res.status}`);
    return res.json();
  },

  /** Create an on-chain auction (operator-only) */
  async createAuction(minimumStake, duration, operatorAddress) {
    const res = await fetch('/api/auctions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minimumStake: String(minimumStake),
        duration: String(duration),
        operatorAddress
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || `Create auction failed: ${res.status}`);
    }
    return res.json();
  },

  /** Get auction details by ID */
  async getAuction(auctionId) {
    const res = await fetch(`/api/auctions/${auctionId}`);
    if (!res.ok) throw new Error(`Fetch auction failed: ${res.status}`);
    return res.json();
  },

  /** Get auction details by NFT token ID (for winner-to-market flow) */
  async getAuctionByToken(tokenId) {
    const res = await fetch(`/api/auctions/by-token/${tokenId}`);
    if (!res.ok) throw new Error(`Fetch auction by token failed: ${res.status}`);
    return res.json();
  },

  /** Close bidding on an auction */
  async closeBidding(auctionId) {
    const res = await fetch(`/api/auctions/${auctionId}/close`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || `Close bidding failed: ${res.status}`);
    }
    return res.json();
  },

  /** AI-filter bidders and set shortlist */
  async filterAuction(auctionId, finalists) {
    const res = await fetch(`/api/auctions/${auctionId}/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalists: finalists || undefined })
    });
    if (!res.ok) throw new Error(`Filter auction failed: ${res.status}`);
    return res.json();
  },

  /** Heuristic evaluation of shortlisted finalists */
  async evaluateAuction(auctionId, expertCount = 3) {
    const res = await fetch(`/api/auctions/${auctionId}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expertCount })
    });
    if (!res.ok) throw new Error(`Evaluate auction failed: ${res.status}`);
    return res.json();
  },

  /** Resolve an auction with winner + oracle signature */
  async resolveAuction(auctionId, winner, winningScore, metadataURI) {
    const res = await fetch(`/api/auctions/${auctionId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner, winningScore: String(winningScore), metadataURI })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.details || err.error || `Resolve auction failed: ${res.status}`);
    }
    return res.json();
  },

  // ─── Prediction Markets (Phase 2) ──────────────────────────

  /** Create a prediction market from a token */
  async createMarket(tokenId, question, options, bettingDuration, feeBps) {
    const res = await fetch('/api/markets/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId: String(tokenId), question, options, bettingDuration: String(bettingDuration), feeBps: Number(feeBps) })
    });
    if (!res.ok) throw new Error(`Create market failed: ${res.status}`);
    return res.json();
  },

  /** Get market details by contract address */
  async getMarketDetails(marketAddress) {
    const res = await fetch(`/api/markets/${marketAddress}`);
    if (!res.ok) throw new Error(`Fetch market failed: ${res.status}`);
    return res.json();
  },

  /** Oracle-signed market resolution */
  async resolveMarket(marketAddress, winningOptionIndex) {
    const res = await fetch(`/api/markets/${marketAddress}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winningOptionIndex })
    });
    if (!res.ok) throw new Error(`Resolve market failed: ${res.status}`);
    return res.json();
  },

  /** List all deployed prediction markets */
  async listMarkets() {
    const res = await fetch('/api/markets');
    if (!res.ok) throw new Error(`List markets failed: ${res.status}`);
    return res.json();
  },

  /** Get tokens owned by an address */
  async getTokens(owner) {
    const res = await fetch(`/api/tokens/${owner}`);
    if (!res.ok) throw new Error(`Fetch tokens failed: ${res.status}`);
    return res.json();
  }
};
