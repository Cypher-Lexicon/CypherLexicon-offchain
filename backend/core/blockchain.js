/**
 * blockchain.js — Contract Interaction Helpers (backend/core)
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const AUCTION_MANAGER_ADDR = process.env.AUCTION_MANAGER_ADDRESS;
const MARKET_FACTORY_ADDR = process.env.MARKET_FACTORY_ADDRESS;
const NFT_CONTRACT_ADDR = process.env.NFT_CONTRACT_ADDRESS;
const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

let provider = null;
let backendWallet = null;

const AuctionManagerABI = [
  'event AuctionCreated(uint256 indexed auctionId, address indexed creator, string questionHash, uint256 minimumStake, uint256 biddingEndTime)',
  'function createAuction(string questionHash, uint256 minimumStake, uint256 duration) external returns (uint256)',
  'function placeBid(uint256 auctionId, string proposalHash) external payable',
  'function closeBidding(uint256 auctionId) external',
  'function setShortlist(uint256 auctionId, address[] finalists) external',
  'function resolveAuction(uint256 auctionId, address winner, uint256 winningScore, string metadataURI, bytes oracleSignature) external',
  'function withdrawStake(uint256 auctionId) external',
  'function getAuction(uint256 auctionId) external view returns (tuple(address,string,uint256,uint256,uint8,address[],address[],address,uint256,uint256,bool))',
  'function getAuctionState(uint256 auctionId) external view returns (uint8)',
  'function getBidders(uint256 auctionId) external view returns (address[] memory)',
  'function getShortlist(uint256 auctionId) external view returns (address[] memory)',
  'function getBidderStake(uint256 auctionId, address bidder) external view returns (uint256)',
  'function getBidderProposal(uint256 auctionId, address bidder) external view returns (string memory)',
  'function isShortlisted(uint256 auctionId, address bidder) external view returns (bool)',
  'function stakeWithdrawn(uint256 auctionId, address bidder) external view returns (bool)',
  'function auctionCount() external view returns (uint256)',
];

const MarketFactoryABI = [
  'event MarketDeployed(address indexed marketAddress, uint256 indexed tokenId, address indexed publisher)',
  'function createMarket(uint256 tokenId, string question, string[] options, uint256 bettingDuration, uint256 feeBps) external returns (address)',
  'function getDeployedMarkets() external view returns (address[] memory)',
  'function tokenToMarket(uint256 tokenId) external view returns (address)',
];

const PredictionMarketABI = [
  'function getMarketDetails() external view returns (string,string[],uint256,uint256,uint256,uint8)',
  'function getOptionPoolAmounts() external view returns (uint256[] memory)',
  'function getOptionCount() external view returns (uint256)',
  'function getMarketState() external view returns (uint8)',
  'function getClaimableWinnings(address user) external view returns (uint256)',
  'function getClaimablePublisherFees() external view returns (uint256)',
  'function placeBet(uint256 optionIndex) external payable',
  'function closeBetting() external',
  'function resolveMarket(uint256 winningOptionIndex, bytes oracleSignature) external',
  'function claimWinnings() external returns (uint256)',
  'function claimPublisherFees() external returns (uint256)',
];

const PublishingRightsNFTABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function totalSupply() external view returns (uint256)',
  'function tokenInfo(uint256 tokenId) external view returns (uint256,string,address,bool)',
  'function getClaimableFees(uint256 tokenId) external view returns (uint256)',
  'function claimFees(uint256 tokenId) external returns (uint256)',
  'function getTokensByOwner(address owner) external view returns (uint256[] memory)',
];

function getProvider() {
  if (!provider) { provider = new ethers.JsonRpcProvider(RPC_URL); }
  return provider;
}

function getBackendWallet() {
  if (!backendWallet && BACKEND_PRIVATE_KEY) {
    const p = getProvider();
    backendWallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, p);
  }
  return backendWallet;
}

function getAuctionManagerContract() {
  const wallet = getBackendWallet();
  if (!wallet) throw new Error('Backend wallet not configured');
  if (!AUCTION_MANAGER_ADDR) throw new Error('AUCTION_MANAGER_ADDRESS not set');
  return new ethers.Contract(AUCTION_MANAGER_ADDR, AuctionManagerABI, wallet);
}

function getMarketFactoryContract() {
  const wallet = getBackendWallet();
  if (!wallet) throw new Error('Backend wallet not configured');
  if (!MARKET_FACTORY_ADDR) throw new Error('MARKET_FACTORY_ADDRESS not set');
  return new ethers.Contract(MARKET_FACTORY_ADDR, MarketFactoryABI, wallet);
}

function getNFTContract() {
  const p = getProvider();
  if (!NFT_CONTRACT_ADDR) throw new Error('NFT_CONTRACT_ADDRESS not set');
  return new ethers.Contract(NFT_CONTRACT_ADDR, PublishingRightsNFTABI, p);
}

function getPredictionMarketContract(marketAddress) {
  const p = getProvider();
  return new ethers.Contract(marketAddress, PredictionMarketABI, p);
}

// ─── Nonce Management ───────────────────────────────────

/** Send a transaction, letting ethers.js auto-manage nonce.
 *  On NONCE_EXPIRED (stale RPC cache), extracts the correct nonce from the
 *  error message and retries once with that explicit nonce. No RPC re-query. */
async function _sendTx(actionName, sendFn) {
  try {
    // First attempt: let ethers Wallet auto-manage nonce internally
    console.log(`[${actionName}] attempting (auto-nonce)...`);
    return await sendFn(null);
  } catch (err) {
    if (err.code === 'NONCE_EXPIRED') {
      // Extract the REAL expected nonce from the RPC error itself
      const match = err.info?.error?.message?.match(/next nonce (\d+)/);
      if (match) {
        const correctNonce = parseInt(match[1], 10);
        console.warn(`[${actionName}] auto-nonce expired, retrying with nonce=${correctNonce} (from error)`);
        return await sendFn(correctNonce);
      }
    }
    throw err;
  }
}

export async function createAuction(questionHash, minimumStake, duration) {
  const contract = getAuctionManagerContract();
  const { tx, receipt } = await _sendTx('createAuction', async (nonce) => {
    const opts = { gasLimit: 500000 };
    if (nonce !== null) opts.nonce = nonce;
    const tx = await contract.createAuction(questionHash, minimumStake, duration, opts);
    console.log(`[createAuction] tx submitted: ${tx.hash}`);
    const receipt = await tx.wait(1, 120000);
    console.log(`[createAuction] tx=${tx.hash} block=${receipt.blockNumber}`);
    return { tx, receipt };
  });
  const event = receipt.logs.find(
    (log) => log.address.toLowerCase() === AUCTION_MANAGER_ADDR.toLowerCase()
  );
  if (!event) throw new Error('AuctionCreated event not found in receipt logs');
  const iface = new ethers.Interface(AuctionManagerABI);
  const parsed = iface.parseLog({ topics: event.topics, data: event.data });
  return {
    auctionId: parsed.args.auctionId.toString(),
    biddingEndTime: parsed.args.biddingEndTime.toString(),
    minimumStake: parsed.args.minimumStake.toString(),
    txHash: tx.hash
  };
}

export async function closeBidding(auctionId) {
  const contract = getAuctionManagerContract();
  await _sendTx('closeBidding', async (nonce) => {
    const opts = {};
    if (nonce !== null) opts.nonce = nonce;
    const tx = await contract.closeBidding(auctionId, opts);
    await tx.wait(1, 120000);
    return { txHash: tx.hash };
  });
}

export async function setShortlist(auctionId, finalists) {
  const contract = getAuctionManagerContract();
  await _sendTx('setShortlist', async (nonce) => {
    const opts = {};
    if (nonce !== null) opts.nonce = nonce;
    const tx = await contract.setShortlist(auctionId, finalists, opts);
    await tx.wait(1, 120000);
    return { txHash: tx.hash };
  });
}

export async function resolveAuction(auctionId, winner, winningScore, metadataURI, oracleSignature) {
  const contract = getAuctionManagerContract();
  const { txHash } = await _sendTx('resolveAuction', async (nonce) => {
    const opts = {};
    if (nonce !== null) opts.nonce = nonce;
    const tx = await contract.resolveAuction(auctionId, winner, winningScore, metadataURI, oracleSignature, opts);
    const receipt = await tx.wait(1, 120000);
    return { txHash: tx.hash };
  });
  return { txHash };
}

export async function getAuctionState(auctionId) {
  const states = ['INACTIVE', 'BIDDING_OPEN', 'BIDDING_CLOSED', 'SHORTLIST_SET', 'COMPLETED'];
  const contract = getAuctionManagerContract();
  const state = await contract.getAuctionState(auctionId);
  return states[state];
}

export async function getAuction(auctionId) {
  const contract = getAuctionManagerContract();
  return contract.getAuction(auctionId);
}

export async function getAuctionBidders(auctionId) {
  const contract = getAuctionManagerContract();
  return contract.getBidders(auctionId);
}

export async function getAuctionShortlist(auctionId) {
  const contract = getAuctionManagerContract();
  return contract.getShortlist(auctionId);
}

export async function getBidderProposal(auctionId, bidder) {
  const contract = getAuctionManagerContract();
  return contract.getBidderProposal(auctionId, bidder);
}

export async function getAuctionCount() {
  const contract = getAuctionManagerContract();
  const count = await contract.auctionCount();
  return count.toString();
}

// ─── Market Operations ───────────────────────────────────

export async function createMarket(tokenId, question, options, bettingDuration, feeBps) {
  const contract = getMarketFactoryContract();
  const { tx, receipt } = await _sendTx('createMarket', async (nonce) => {
    const opts = {};
    if (nonce !== null) opts.nonce = nonce;
    const tx = await contract.createMarket(tokenId, question, options, bettingDuration, feeBps, opts);
    const receipt = await tx.wait(1, 120000);
    return { tx, receipt };
  });
  const event = receipt.logs.find(
    (log) => log.address.toLowerCase() === MARKET_FACTORY_ADDR.toLowerCase()
  );
  const iface = new ethers.Interface(MarketFactoryABI);
  const parsed = iface.parseLog({ topics: event.topics, data: event.data });
  return { marketAddress: parsed.args.marketAddress, tokenId: tokenId, txHash: tx.hash };
}

export async function resolveMarket(marketAddress, winningOptionIndex, oracleSignature) {
  const wallet = getBackendWallet();
  if (!wallet) throw new Error('Backend wallet not configured');
  const contract = new ethers.Contract(marketAddress, PredictionMarketABI, wallet);
  await _sendTx('resolveMarket', async (nonce) => {
    const opts = {};
    if (nonce !== null) opts.nonce = nonce;
    const tx = await contract.resolveMarket(winningOptionIndex, oracleSignature, opts);
    await tx.wait(1, 120000);
    return { txHash: tx.hash };
  });
}

export async function getMarketDetails(marketAddress) {
  const contract = getPredictionMarketContract(marketAddress);
  const details = await contract.getMarketDetails();
  return {
    question: details[0],
    options: details[1],
    bettingEndTime: details[2].toString(),
    feeBps: details[3].toString(),
    winningOptionIndex: details[4].toString(),
    state: ['INACTIVE', 'BETTING_OPEN', 'BETTING_CLOSED', 'RESOLVED'][details[5]],
  };
}

export async function getDeployedMarkets() {
  const contract = getMarketFactoryContract();
  return contract.getDeployedMarkets();
}

export async function getTokensForOwner(owner) {
  const contract = getNFTContract();
  return contract.getTokensByOwner(owner);
}

export async function getClaimablePublisherFees(marketAddress) {
  const contract = getPredictionMarketContract(marketAddress);
  return contract.getClaimablePublisherFees();
}

export async function isBackendWalletConfigured() {
  return !!(BACKEND_PRIVATE_KEY && BACKEND_PRIVATE_KEY !== 'your_backend_key_here');
}
