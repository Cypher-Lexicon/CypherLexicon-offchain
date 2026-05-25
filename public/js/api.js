/**
 * api.js — Backend API Client
 * 
 * Wraps all fetch calls to the Express server endpoints.
 * All functions return parsed JSON or throw on error.
 */

const API = {

  // ─── News ──────────────────────────────────────────────────

  /** Fetch the non-English news feed (Phase 1 translation source) */
  async fetchNews() {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(`News fetch failed: ${res.status}`);
    return res.json();
  },

  // ─── Translation Auction (simulation) ──────────────────────

  /** Run a translation auction against a news item index */
  async runAuction(newsIndex) {
    const res = await fetch('/api/auction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newsIndex })
    });
    if (!res.ok) throw new Error(`Auction failed: ${res.status}`);
    return res.json();
  },

  // ─── Web3 Status ───────────────────────────────────────────

  /** Get oracle + backend wallet readiness */
  async getWeb3Status() {
    const res = await fetch('/api/web3/status');
    if (!res.ok) throw new Error(`Web3 status failed: ${res.status}`);
    return res.json();
  },

  // ─── On-Chain Auction (Phase 1) ────────────────────────────

  /** Create an on-chain auction */
  async createAuction(questionHash, minimumStake, duration) {
    const res = await fetch('/api/auctions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionHash, minimumStake: String(minimumStake), duration: String(duration) })
    });
    if (!res.ok) throw new Error(`Create auction failed: ${res.status}`);
    return res.json();
  },

  /** Get auction details by ID */
  async getAuction(auctionId) {
    const res = await fetch(`/api/auctions/${auctionId}`);
    if (!res.ok) throw new Error(`Fetch auction failed: ${res.status}`);
    return res.json();
  },

  /** Close bidding on an auction */
  async closeBidding(auctionId) {
    const res = await fetch(`/api/auctions/${auctionId}/close`, { method: 'POST' });
    if (!res.ok) throw new Error(`Close bidding failed: ${res.status}`);
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

  /** Resolve an auction with winner + oracle signature */
  async resolveAuction(auctionId, winner, winningScore, metadataURI) {
    const res = await fetch(`/api/auctions/${auctionId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winner, winningScore: String(winningScore), metadataURI })
    });
    if (!res.ok) throw new Error(`Resolve auction failed: ${res.status}`);
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
