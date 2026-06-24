/**
 * Tests for core/oracle.js — ECDSA signing for auctions and prediction markets
 *
 * Verifies the oracle signing logic that bridges off-chain resolution
 * to on-chain verification (steps 5-6 in phase2.md).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';

// Use a well-known test private key (never used in production)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Set env before importing the module under test
process.env.ORACLE_PRIVATE_KEY = TEST_PRIVATE_KEY;

// Clear the module registry to ensure a fresh load with our env var
const oracleModule = await import('../../backend/core/oracle.js');
const { signAuctionResolution, signMarketResolution, getOracleAddress } = oracleModule;

const TEST_WALLET = new ethers.Wallet(TEST_PRIVATE_KEY);

describe('getOracleAddress', () => {
  it('should return the derived address from the test private key', () => {
    const addr = getOracleAddress();
    expect(addr).toBe(TEST_WALLET.address);
    expect(ethers.isAddress(addr)).toBe(true);
  });
});

describe('signAuctionResolution', () => {
  it('should produce a valid ethereum signature (65 bytes hex)', () => {
    const auctionId = 1;
    const winner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const winningScore = 8500;

    const signature = signAuctionResolution(auctionId, winner, winningScore);
    expect(typeof signature).toBe('string');
    expect(signature.startsWith('0x')).toBe(true);

    // Verify it's a valid ECDSA signature (65 bytes → 132 hex chars + 0x prefix = 134)
    const sigBytes = ethers.getBytes(signature);
    expect(sigBytes.length).toBe(65);
  });

  it('should produce different signatures for different auction data', () => {
    const sig1 = signAuctionResolution(1, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 8500);
    const sig2 = signAuctionResolution(2, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 8500);
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different winners', () => {
    const winner1 = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const winner2 = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const sig1 = signAuctionResolution(1, winner1, 8500);
    const sig2 = signAuctionResolution(1, winner2, 8500);
    expect(sig1).not.toBe(sig2);
  });

  it('should produce a signature that recovers to the oracle address', () => {
    const auctionId = 42;
    const winner = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const winningScore = 9200;

    const signature = signAuctionResolution(auctionId, winner, winningScore);

    // Reconstruct the message that was signed
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

    const recoveredAddr = ethers.recoverAddress(ethSignedMessage, signature);
    expect(recoveredAddr).toBe(TEST_WALLET.address);
  });

  it('should be deterministic (same inputs → same signature)', () => {
    const sig1 = signAuctionResolution(5, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 7500);
    const sig2 = signAuctionResolution(5, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 7500);
    expect(sig1).toBe(sig2);
  });
});

describe('signMarketResolution', () => {
  const marketAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  it('should produce a valid ethereum signature (65 bytes hex)', () => {
    const signature = signMarketResolution(marketAddress, 0);
    expect(typeof signature).toBe('string');
    expect(signature.startsWith('0x')).toBe(true);

    const sigBytes = ethers.getBytes(signature);
    expect(sigBytes.length).toBe(65);
  });

  it('should produce different signatures for different winning options', () => {
    const sig1 = signMarketResolution(marketAddress, 0);
    const sig2 = signMarketResolution(marketAddress, 1);
    expect(sig1).not.toBe(sig2);
  });

  it('should produce different signatures for different market addresses', () => {
    const addr1 = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
    const addr2 = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
    const sig1 = signMarketResolution(addr1, 0);
    const sig2 = signMarketResolution(addr2, 0);
    expect(sig1).not.toBe(sig2);
  });

  it('should produce a signature that recovers to the oracle address', () => {
    const winningOptionIndex = 1;
    const signature = signMarketResolution(marketAddress, winningOptionIndex);

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

    const recoveredAddr = ethers.recoverAddress(ethSignedMessage, signature);
    expect(recoveredAddr).toBe(TEST_WALLET.address);
  });

  it('should be deterministic (same inputs → same signature)', () => {
    const sig1 = signMarketResolution(marketAddress, 2);
    const sig2 = signMarketResolution(marketAddress, 2);
    expect(sig1).toBe(sig2);
  });
});
