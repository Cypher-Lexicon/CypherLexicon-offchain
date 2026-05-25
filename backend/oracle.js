/**
 * oracle.js — ECDSA Oracle Signer
 *
 * Signs deterministic messages for the AuctionManager and PredictionMarket
 * smart contracts. Uses the ORACLE_PRIVATE_KEY from .env to produce
 * ECDSA signatures that the contracts verify on-chain.
 *
 * Signature format for AuctionManager:
 *   message = keccak256(abi.encodePacked(auctionId, winner, winningScore))
 *   ethSignedMessage = "\x19Ethereum Signed Message:\n32" + message
 *
 * Signature format for PredictionMarket:
 *   message = keccak256(abi.encodePacked(marketAddress, winningOptionIndex))
 *   ethSignedMessage = "\x19Ethereum Signed Message:\n32" + message
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY;

if (!PRIVATE_KEY || PRIVATE_KEY === 'your_oracle_key_here') {
  console.warn('WARNING: No valid ORACLE_PRIVATE_KEY set. Oracle signing will fail.');
}

let wallet = null;
if (PRIVATE_KEY && PRIVATE_KEY !== 'your_oracle_key_here') {
  wallet = new ethers.Wallet(PRIVATE_KEY);
  console.log(`Oracle signer initialized: ${wallet.address}`);
}

/**
 * Sign an auction resolution message for AuctionManager.
 *
 * @param {string|number} auctionId - The auction ID.
 * @param {string} winner - The winning bidder's Ethereum address.
 * @param {string|number} winningScore - The winner's aggregated expert score.
 * @returns {string} Compact ECDSA signature (r + s + v, 65 bytes hex).
 */
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
  return signature.compactSerialized;
}

/**
 * Sign a market resolution message for PredictionMarket.
 *
 * @param {string} marketAddress - The PredictionMarket contract address.
 * @param {string|number} winningOptionIndex - Index of the winning outcome option.
 * @returns {string} Compact ECDSA signature (r + s + v, 65 bytes hex).
 */
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
  return signature.compactSerialized;
}

/**
 * Get the oracle signer address (used as the oracleAddress in contracts).
 * @returns {string|null}
 */
export function getOracleAddress() {
  return wallet ? wallet.address : null;
}
