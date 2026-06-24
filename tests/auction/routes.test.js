/**
 * Integration tests for auction/routes.js — Auction API Routes
 *
 * Tests the HTTP layer for phase1 auction flow that feeds into phase2:
 *   POST /api/auctions/create       — operator-only creation
 *   GET  /api/auctions              — list all auctions
 *   GET  /api/auctions/:id          — auction details
 *   POST /api/auctions/:id/close    — close bidding
 *   POST /api/auctions/:id/filter   — two-stage filter + shortlist
 *   POST /api/auctions/:id/evaluate — heuristic evaluation
 *   POST /api/auctions/:id/resolve  — oracle-signed resolution
 *
 * All blockchain/oracle dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Environment setup ──────────────────────────────────────────────────

const OPERATOR_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BIDDER_ADDR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const BIDDER2_ADDR = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

process.env.ORACLE_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
process.env.OPERATOR_ADDRESSES = OPERATOR_ADDR;
// Don't set ANTHROPIC_API_KEY so AI evaluation is skipped (falls back to heuristic)

// ─── Mock Anthropic SDK ─────────────────────────────────────────────────

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify({ scores: [{ index: 0, confidence_score: 0.85 }] }) }],
      }),
    },
  })),
}));

// ─── Mock blockchain module ─────────────────────────────────────────────

const mockCreateAuction = vi.fn();
const mockCloseBidding = vi.fn();
const mockSetShortlist = vi.fn();
const mockResolveAuction = vi.fn();
const mockGetAuction = vi.fn();
const mockGetAuctionState = vi.fn();
const mockGetAuctionBidders = vi.fn();
const mockGetAuctionShortlist = vi.fn();
const mockGetBidderProposal = vi.fn();
const mockGetAuctionCount = vi.fn();

vi.mock('../../backend/core/blockchain.js', () => ({
  createAuction: mockCreateAuction,
  closeBidding: mockCloseBidding,
  setShortlist: mockSetShortlist,
  resolveAuction: mockResolveAuction,
  getAuction: mockGetAuction,
  getAuctionState: mockGetAuctionState,
  getAuctionBidders: mockGetAuctionBidders,
  getAuctionShortlist: mockGetAuctionShortlist,
  getBidderProposal: mockGetBidderProposal,
  getAuctionCount: mockGetAuctionCount,
}));

// ─── Mock oracle module ─────────────────────────────────────────────────

// The signAuctionResolution is re-imported inside the module at the top,
// but since we mock 'backend/core/blockchain.js', oracle is imported directly.
// We need to mock oracle separately.
vi.mock('../../backend/core/oracle.js', () => ({
  signAuctionResolution: vi.fn(() => '0xmocked_signature_0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  signMarketResolution: vi.fn(() => '0xmocked_signature'),
}));

// We also need to mock calculateScore from agents.js since it's imported in the filter route
vi.mock('../../backend/core/agents.js', async () => {
  const actual = await vi.importActual('../../backend/core/agents.js');
  return {
    ...actual,
    calculateScore: vi.fn(actual.calculateScore),
  };
});

const { registerAuctionRoutes } = await import('../../backend/auction/routes.js');

const GOOD_PROPOSAL = JSON.stringify({
  q: 'Will BTC reach $100k by end of 2026?',
  d: 'Bitcoin price prediction for the end of 2026.',
  o: ['Yes', 'No'],
  r: '2026-12-31',
});

function createTestApp() {
  const app = express();
  app.use(express.json());
  registerAuctionRoutes(app);
  return app;
}

describe('POST /api/auctions/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create an auction when called by operator', async () => {
    mockCreateAuction.mockResolvedValue({
      auctionId: '1',
      biddingEndTime: '1700000000',
      minimumStake: '100',
      txHash: '0xtx',
    });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/create')
      .send({ minimumStake: '100', duration: '86400', operatorAddress: OPERATOR_ADDR });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.auctionId).toBe('1');
    expect(mockCreateAuction).toHaveBeenCalledTimes(1);
  });

  it('should reject non-operator addresses', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/create')
      .send({ minimumStake: '100', duration: '86400', operatorAddress: '0x0000000000000000000000000000000000000000' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Not authorized');
  });

  it('should reject missing minimumStake', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/create')
      .send({ duration: '86400', operatorAddress: OPERATOR_ADDR });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('minimumStake');
  });

  it('should reject missing duration', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/create')
      .send({ minimumStake: '100', operatorAddress: OPERATOR_ADDR });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('duration');
  });
});

describe('GET /api/auctions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list all auctions', async () => {
    mockGetAuctionCount.mockResolvedValue('2');
    mockGetAuction.mockImplementation((id) => {
      if (id === 1) {
        return Promise.resolve([
          '0x123',  // creator
          GOOD_PROPOSAL, // questionHash
          100n,      // minimumStake
          1700000000n, // biddingEndTime
          0,         // state
          ['0xaaa'], // bidders
          ['0xaaa'], // shortlist
          OPERATOR_ADDR, // winner
          8500n,      // winningScore
          1n,         // nftTokenId
          false,      // withdrawn
        ]);
      }
      return Promise.resolve([
        '0x456',
        'OPEN_AUCTION',
        200n,
        1800000000n,
        1, // BIDDING_OPEN
        [],
        [],
        '0x0000000000000000000000000000000000000000',
        0n,
        0n,
        false,
      ]);
    });
    mockGetAuctionState.mockImplementation((id) => {
      if (id === 1) return 'COMPLETED';
      return 'BIDDING_OPEN';
    });
    mockGetAuctionBidders.mockResolvedValue([]);

    const app = createTestApp();
    const res = await request(app).get('/api/auctions');

    expect(res.status).toBe(200);
    expect(res.body.auctions).toHaveLength(2);
    expect(res.body.auctions[0].auctionId).toBe(1);
    expect(res.body.auctions[0].isComplete).toBe(true);
    expect(res.body.auctions[0].winner).toBe(OPERATOR_ADDR);
    expect(res.body.auctions[0].question).toBe('Will BTC reach $100k by end of 2026?');
    expect(res.body.auctions[1].auctionId).toBe(2);
    expect(res.body.auctions[1].isActive).toBe(true);
    expect(res.body.auctions[1].question).toBe('');
  });

  it('should handle errors gracefully for individual auctions', async () => {
    mockGetAuctionCount.mockResolvedValue('2');
    mockGetAuction.mockRejectedValueOnce(new Error('RPC error'));
    mockGetAuction.mockResolvedValueOnce([
      '0x123',
      GOOD_PROPOSAL,
      100n, 1700000000n, 4, [], [], OPERATOR_ADDR, 8500n, 1n, false,
    ]);
    mockGetAuctionState.mockResolvedValue('COMPLETED');
    mockGetAuctionBidders.mockResolvedValue([]);

    const app = createTestApp();
    const res = await request(app).get('/api/auctions');

    expect(res.status).toBe(200);
    expect(res.body.auctions).toHaveLength(1);
  });
});

describe('GET /api/auctions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return auction details for a valid ID', async () => {
    mockGetAuction.mockResolvedValue([
      '0x123',
      GOOD_PROPOSAL,
      100n, 1700000000n, 4, ['0xaaa'], ['0xbbb'], OPERATOR_ADDR, 8500n, 1n, false,
    ]);
    mockGetAuctionState.mockResolvedValue('COMPLETED');
    mockGetAuctionBidders.mockResolvedValue(['0xaaa']);
    mockGetBidderProposal.mockResolvedValue(GOOD_PROPOSAL);

    const app = createTestApp();
    const res = await request(app).get('/api/auctions/1');

    expect(res.status).toBe(200);
    expect(res.body.auctionId).toBe(1);
    expect(res.body.state).toBe('COMPLETED');
    expect(res.body.question).toBe('Will BTC reach $100k by end of 2026?');
  });
});

describe('POST /api/auctions/:id/close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should close bidding for an auction', async () => {
    mockCloseBidding.mockResolvedValue({});

    const app = createTestApp();
    const res = await request(app).post('/api/auctions/1/close');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockCloseBidding).toHaveBeenCalledWith(1);
  });
});

describe('POST /api/auctions/:id/filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should filter bidders when no finalists provided', async () => {
    mockGetAuctionBidders.mockResolvedValue([BIDDER_ADDR, BIDDER2_ADDR]);
    mockGetBidderProposal.mockResolvedValue(GOOD_PROPOSAL);
    mockSetShortlist.mockResolvedValue({ txHash: '0xfilter' });

    const app = createTestApp();
    const res = await request(app).post('/api/auctions/1/filter');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.finalists).toBeDefined();
    expect(mockSetShortlist).toHaveBeenCalled();
  });

  it('should use provided finalists array directly', async () => {
    mockSetShortlist.mockResolvedValue({ txHash: '0xfilter' });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/1/filter')
      .send({ finalists: [BIDDER_ADDR] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.finalists).toEqual([BIDDER_ADDR]);
    expect(mockSetShortlist).toHaveBeenCalledWith(1, [BIDDER_ADDR]);
  });

  it('should return 400 if no bidders exist', async () => {
    mockGetAuctionBidders.mockResolvedValue([]);

    const app = createTestApp();
    const res = await request(app).post('/api/auctions/1/filter');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No bidders');
  });
});

describe('POST /api/auctions/:id/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should evaluate shortlisted finalists heuristically', async () => {
    mockGetAuctionShortlist.mockResolvedValue([BIDDER_ADDR, BIDDER2_ADDR]);
    mockGetBidderProposal.mockImplementation((id, addr) => {
      if (addr === BIDDER_ADDR) return Promise.resolve(GOOD_PROPOSAL);
      return Promise.resolve(JSON.stringify({ q: 'Will ETH hit $5k?', d: '', o: ['Yes', 'No'], r: '' }));
    });

    const app = createTestApp();
    const res = await request(app).post('/api/auctions/1/evaluate');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.method).toBe('heuristic');
    expect(res.body.winner).toBeDefined();
    expect(res.body.winner.address).toBe(BIDDER_ADDR);
    expect(res.body.winner.winningScore).toBeGreaterThan(0);
    expect(res.body.scores).toHaveLength(2);
  });

  it('should return 400 if no shortlist exists', async () => {
    mockGetAuctionShortlist.mockResolvedValue([]);

    const app = createTestApp();
    const res = await request(app).post('/api/auctions/1/evaluate');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No shortlist found');
  });
});

describe('POST /api/auctions/:id/resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve an auction with winner and winningScore', async () => {
    mockResolveAuction.mockResolvedValue({ txHash: '0xresolve' });
    mockGetAuction.mockResolvedValue([
      '0x123',
      GOOD_PROPOSAL,
      100n, 1700000000n, 4, [], [], OPERATOR_ADDR, 8500n, 1n, false,
    ]);

    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/1/resolve')
      .send({ winner: OPERATOR_ADDR, winningScore: 8500 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.winner).toBe(OPERATOR_ADDR);
    expect(res.body.winningScore).toBe(8500);
    expect(mockResolveAuction).toHaveBeenCalledTimes(1);
  });

  it('should reject missing winner address', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/1/resolve')
      .send({ winningScore: 8500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid winner');
  });

  it('should reject missing winningScore', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/auctions/1/resolve')
      .send({ winner: OPERATOR_ADDR });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('winningScore');
  });
});
