/**
 * market/routes.js — Prediction Market API Routes (backend/market)
 *
 * Endpoints for the PREDICTION MARKET phase:
 *   POST /api/markets/create       — Create market (token holder only)
 *   GET  /api/markets              — List deployed markets
 *   GET  /api/markets/:address     — Get market details
 *   POST /api/markets/:address/resolve — Oracle-signed resolution
 *   GET  /api/tokens/:owner        — Get tokens for an address
 */

import {
  signMarketResolution,
} from '../core/oracle.js';
import {
  createMarket,
  resolveMarket,
  getMarketDetails,
  getDeployedMarkets,
  getTokensForOwner,
} from '../core/blockchain.js';

const ethersRegex = /^0x[a-fA-F0-9]{40}$/;

export function registerMarketRoutes(app) {

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

  app.get('/api/markets', async (req, res) => {
    try {
      const markets = await getDeployedMarkets();
      res.json(markets);
    } catch (error) {
      console.error('Error listing markets:', error);
      res.status(500).json({ error: 'Failed to list markets', details: error.message });
    }
  });

  app.get('/api/markets/:address', async (req, res) => {
    try {
      const details = await getMarketDetails(req.params.address);
      res.json(details);
    } catch (error) {
      console.error('Error fetching market:', error);
      res.status(500).json({ error: 'Failed to fetch market', details: error.message });
    }
  });

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

  app.get('/api/tokens/:owner', async (req, res) => {
    try {
      const tokens = await getTokensForOwner(req.params.owner);
      res.json(tokens.map(t => t.toString()));
    } catch (error) {
      console.error('Error fetching tokens:', error);
      res.status(500).json({ error: 'Failed to fetch tokens', details: error.message });
    }
  });
}
