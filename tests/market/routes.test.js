/**
 * Integration tests for market/routes.js — Prediction Market API Routes
 *
 * Tests the HTTP layer for phase2 flow:
 *   POST /api/markets/create — market creation
 *   GET  /api/markets        — list markets
 *   GET  /api/markets/:address — market details
 *   POST /api/markets/:address/resolve — oracle-signed resolution
 *   GET  /api/tokens/:owner  — owner tokens
 *
 * All blockchain/oracle dependencies are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Set a test oracle key before any oracle module loading
process.env.ORACLE_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// ─── Mock oracle module ─────────────────────────────────────────────────
// Mock before blockchain to prevent real ethers address validation

vi.mock('../../backend/core/oracle.js', () => ({
  signAuctionResolution: vi.fn(() => '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  signMarketResolution: vi.fn(() => '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'),
  getOracleAddress: vi.fn(() => '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'),
}));

// ─── Mock blockchain module ─────────────────────────────────────────────

const mockCreateMarket = vi.fn();
const mockResolveMarket = vi.fn();
const mockGetMarketDetails = vi.fn();
const mockGetDeployedMarkets = vi.fn();
const mockGetTokensForOwner = vi.fn();

vi.mock('../../backend/core/blockchain.js', () => ({
  createMarket: mockCreateMarket,
  resolveMarket: mockResolveMarket,
  getMarketDetails: mockGetMarketDetails,
  getDeployedMarkets: mockGetDeployedMarkets,
  getTokensForOwner: mockGetTokensForOwner,
}));

// Import after mocks are set up
const { registerMarketRoutes } = await import('../../backend/market/routes.js');

function createTestApp() {
  const app = express();
  app.use(express.json());
  registerMarketRoutes(app);
  return app;
}

describe('POST /api/markets/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a market with valid inputs', async () => {
    mockCreateMarket.mockResolvedValue({
      marketAddress: '0x123',
      tokenId: '1',
      txHash: '0xtx',
    });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/create')
      .send({
        tokenId: '1',
        question: 'Will BTC reach $100k?',
        options: ['Yes', 'No'],
        bettingDuration: 604800,
        feeBps: 200,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.marketAddress).toBe('0x123');
    expect(mockCreateMarket).toHaveBeenCalledTimes(1);
    expect(mockCreateMarket).toHaveBeenCalledWith('1', 'Will BTC reach $100k?', ['Yes', 'No'], 604800, 200);
  });

  it('should reject missing tokenId', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/create')
      .send({
        question: 'Test?',
        options: ['Yes', 'No'],
        bettingDuration: 604800,
        feeBps: 200,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('tokenId');
  });

  it('should reject missing question', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/create')
      .send({
        tokenId: '1',
        options: ['Yes', 'No'],
        bettingDuration: 604800,
        feeBps: 200,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('question');
  });

  it('should reject invalid options (less than 2)', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/create')
      .send({
        tokenId: '1',
        question: 'Test?',
        options: ['Yes'],
        bettingDuration: 604800,
        feeBps: 200,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('options');
  });

  it('should reject missing bettingDuration', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/create')
      .send({
        tokenId: '1',
        question: 'Test?',
        options: ['Yes', 'No'],
        feeBps: 200,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('bettingDuration');
  });

  it('should reject missing feeBps', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/create')
      .send({
        tokenId: '1',
        question: 'Test?',
        options: ['Yes', 'No'],
        bettingDuration: 604800,
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('feeBps');
  });

  it('should return 500 when blockchain call fails', async () => {
    mockCreateMarket.mockRejectedValue(new Error('RPC error'));

    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/create')
      .send({
        tokenId: '1',
        question: 'Test?',
        options: ['Yes', 'No'],
        bettingDuration: 604800,
        feeBps: 200,
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to create market');
  });
});

describe('GET /api/markets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list deployed markets', async () => {
    mockGetDeployedMarkets.mockResolvedValue(['0x123', '0x456']);

    const app = createTestApp();
    const res = await request(app).get('/api/markets');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(['0x123', '0x456']);
    expect(mockGetDeployedMarkets).toHaveBeenCalledTimes(1);
  });

  it('should return 500 on blockchain error', async () => {
    mockGetDeployedMarkets.mockRejectedValue(new Error('RPC error'));

    const app = createTestApp();
    const res = await request(app).get('/api/markets');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to list markets');
  });
});

describe('GET /api/markets/:address', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return market details', async () => {
    mockGetMarketDetails.mockResolvedValue({
      question: 'Will BTC reach $100k?',
      options: ['Yes', 'No'],
      bettingEndTime: '1700000000',
      feeBps: '200',
      winningOptionIndex: '0',
      state: 'BETTING_OPEN',
    });

    const app = createTestApp();
    const res = await request(app).get('/api/markets/0x123');

    expect(res.status).toBe(200);
    expect(res.body.question).toBe('Will BTC reach $100k?');
    expect(res.body.state).toBe('BETTING_OPEN');
    expect(mockGetMarketDetails).toHaveBeenCalledWith('0x123');
  });

  it('should return 500 on blockchain error', async () => {
    mockGetMarketDetails.mockRejectedValue(new Error('Not found'));

    const app = createTestApp();
    const res = await request(app).get('/api/markets/0x999');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch market');
  });
});

describe('POST /api/markets/:address/resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should resolve a market with valid inputs', async () => {
    mockResolveMarket.mockResolvedValue({ txHash: '0xresolve' });

    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/0x123/resolve')
      .send({ winningOptionIndex: 0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockResolveMarket).toHaveBeenCalledTimes(1);
    // The first argument to resolveMarket is the marketAddress, second is winningOptionIndex, third is signature
    const callArgs = mockResolveMarket.mock.calls[0];
    expect(callArgs[0]).toBe('0x123');
    expect(callArgs[1]).toBe(0);
    // Third arg should be a hex string signature
    expect(callArgs[2]).toMatch(/^0x[a-f0-9]+$/i);
  });

  it('should reject missing winningOptionIndex', async () => {
    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/0x123/resolve')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('winningOptionIndex');
  });

  it('should return 500 when blockchain resolution fails', async () => {
    mockResolveMarket.mockRejectedValue(new Error('Resolution failed'));

    const app = createTestApp();
    const res = await request(app)
      .post('/api/markets/0x123/resolve')
      .send({ winningOptionIndex: 0 });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to resolve market');
  });
});

describe('GET /api/tokens/:owner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return tokens for an owner address', async () => {
    mockGetTokensForOwner.mockResolvedValue([BigInt(1), BigInt(2), BigInt(3)]);

    const app = createTestApp();
    const res = await request(app).get('/api/tokens/0x123');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(['1', '2', '3']);
  });

  it('should return empty array for owner with no tokens', async () => {
    mockGetTokensForOwner.mockResolvedValue([]);

    const app = createTestApp();
    const res = await request(app).get('/api/tokens/0x999');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
