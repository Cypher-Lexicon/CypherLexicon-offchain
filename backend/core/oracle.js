/**
 * oracle.js — ECDSA Oracle Signer (backend/core)
 *
 * Signs deterministic messages for the AuctionManager and PredictionMarket
 * smart contracts. Uses the ORACLE_PRIVATE_KEY from .env.
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;

if (!PRIVATE_KEY || PRIVATE_KEY === 'your_oracle_key_here') {
  console.warn('WARNING: No valid ORACLE_PRIVATE_KEY set. Oracle signing will fail.');
}

let wallet = null;
if (PRIVATE_KEY && PRIVATE_KEY !== 'your_oracle_key_here') {
  wallet = new ethers.Wallet(PRIVATE_KEY);
  console.log(`Oracle signer initialized: ${wallet.address}`);
}

export function signAuctionResolution(auctionId, winner, winningScore) {
  if (!wallet) throw new Error('Oracle not initialized. Set ORACLE_PRIVATE_KEY in .env');
  const messageHash = ethers.solidityPackedKeccak256(
    ['uint256', 'address', 'uint256'],
    [auctionId, winner, winningScore]
  );
  const ethSignedMessage = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes('\x19Ethereum Signed Message:\n32'),
      messageHash
    ])
  );
  const signature = wallet.signingKey.sign(ethSignedMessage);
  return signature.serialized;
}

export function signMarketResolution(marketAddress, winningOptionIndex) {
  if (!wallet) throw new Error('Oracle not initialized. Set ORACLE_PRIVATE_KEY in .env');
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'uint256'],
    [marketAddress, winningOptionIndex]
  );
  const ethSignedMessage = ethers.keccak256(
    ethers.concat([
      ethers.toUtf8Bytes('\x19Ethereum Signed Message:\n32'),
      messageHash
    ])
  );
  const signature = wallet.signingKey.sign(ethSignedMessage);
  return signature.serialized;
}

export function getOracleAddress() {
  return wallet ? wallet.address : null;
}
