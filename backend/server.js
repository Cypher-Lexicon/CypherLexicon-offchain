/**
 * server.js — Cypher Lexicon Main Server
 *
 * Loads auction and prediction market route modules,
 * serves static files, and provides operator authentication.
 */

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { getOracleAddress } from './core/oracle.js';
import { isBackendWalletConfigured } from './core/blockchain.js';

// ─── Phase modules ──────────────────────────────────────────
import { registerAuctionRoutes } from './auction/routes.js';
import { registerMarketRoutes } from './market/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(projectRoot, 'public')));

// ═══════════════════════════════════════════════════════════
//  OPERATOR AUTHENTICATION
// ═══════════════════════════════════════════════════════════

const ethersRegex = /^0x[a-fA-F0-9]{40}$/;

function loadOperatorAddresses() {
  const raw = process.env.OPERATOR_ADDRESSES || '';
  return raw.split(',').map(a => a.trim().toLowerCase()).filter(a => ethersRegex.test(a));
}

app.get('/api/auth/operator/:address', (req, res) => {
  const addr = (req.params.address || '').toLowerCase();
  if (!ethersRegex.test(addr)) {
    return res.json({ isOperator: false, address: addr, reason: 'invalid-address' });
  }
  const operators = loadOperatorAddresses();
  res.json({ isOperator: operators.includes(addr), address: addr });
});

// ═══════════════════════════════════════════════════════════
//  WEB3 STATUS
// ═══════════════════════════════════════════════════════════

app.get('/api/web3/status', async (req, res) => {
  const oracleAddr = getOracleAddress();
  res.json({
    oracle_address: oracleAddr,
    oracle_ready: !!oracleAddr,
    backend_ready: await isBackendWalletConfigured(),
    auction_manager: process.env.AUCTION_MANAGER_ADDRESS || null,
    market_factory: process.env.MARKET_FACTORY_ADDRESS || null,
    nft_contract: process.env.NFT_CONTRACT_ADDRESS || null,
  });
});

// ═══════════════════════════════════════════════════════════
//  PHASE MODULES: AUCTION & PREDICTION MARKET
// ═══════════════════════════════════════════════════════════

registerAuctionRoutes(app);
registerMarketRoutes(app);

// ═══════════════════════════════════════════════════════════
//  STATIC & STARTUP
// ═══════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.sendFile(path.join(projectRoot, 'public', 'index.html'));
});

app.listen(PORT, () => {
  const oracleAddr = getOracleAddress();
  const operators = loadOperatorAddresses();
  console.log(`\n==================================================`);
  console.log(`  Cypher Lexicon — AUCTION + PREDICTION MARKET`);
  console.log(`  Server: http://localhost:${PORT}`);
  console.log(`  Oracle: ${oracleAddr || 'NOT CONFIGURED'}`);
  console.log(`  Backend wallet: ${isBackendWalletConfigured() ? 'configured' : 'NOT CONFIGURED'}`);
  console.log(`  Operators: ${operators.length} address(es) whitelisted`);
  console.log(`==================================================\n`);
});
