/**
 * blockchain.js — Contract Interaction Helpers
 *
 * Provides utilities to interact with the Prediction Market Auction
 * smart contracts on Arc Testnet using ethers.js v6.
 *
 * Required env vars:
 *   ARC_RPC_URL     — Arc Testnet RPC endpoint
 *   BACKEND_PRIVATE_KEY — Backend operator's private key (for tx signing)
 *   AUCTION_MANAGER_ADDRESS — Deployed AuctionManager contract
 *   MARKET_FACTORY_ADDRESS  — Deployed MarketFactory contract
 *   NFT_CONTRACT_ADDRESS    — Deployed PublishingRightsNFT contract
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// ─── Configuration ───────────────────────────────────────────────────────────

const RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const AUCTION_MANAGER_ADDR = process.env.AUCTION_MANAGER_ADDRESS;
const MARKET_FACTORY_ADDR = process.env.MARKET_FACTORY_ADDRESS;
const NFT_CONTRACT_ADDR = process.env.NFT_CONTRACT_ADDRESS;
const BACKEND_PRIVATE_KEY = process.env.BACKEND_PRIVATE_KEY;

let provider = null;
let backendWallet = null;

// ─── ABI Fragments ───────────────────────────────────────────────────────────

const AuctionManagerABI = [
  'function createAuction(string questionHash, uint256 minimumStake, uint256 duration) external returns (uint256)',
  'function closeBidding(uint256 auctionId) external',
  'function setShortlist(uint256 auctionId, address[] calldata finalists) external',
  'function resolveAuction(uint256 auctionId, address winner, uint256 winningScore, string calldata metadataURI, bytes calldata oracleSignature) external',
  'function getAuction(uint256 auctionId) external view returns (tuple(address,string,uint256,uint256,uint8,address[],address[],address,uint256,uint256,bool))',
  'function getAuctionState(uint256 auctionId) external view returns (uint8)',
  'function getBidders(uint256 auctionId) external view returns (address[] memory)',
  'function getShortlist(uint256 auctionId) external view returns (address[] memory)',
  'function getBidderStake(uint256 auctionId, address bidder) external view returns (uint256)',
  'function getBidderProposal(uint256 auctionId, address bidder) external view returns (string memory)',
  'function auctionCount() external view returns (uint256)',
];

const MarketFactoryABI = [
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
  'function placeBet(uint256 optionIndex, uint256 amount) external',
  'function closeBetting() external',
  'function resolveMarket(uint256 winningOptionIndex, bytes calldata oracleSignature) external',
];

const PublishingRightsNFTABI = [
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function totalSupply() external view returns (uint256)',
  'function tokenInfo(uint256 tokenId) external view returns (uint256,string,address,bool)',
  'function getClaimableFees(uint256 tokenId) external view returns (uint256)',
  'function claimFees(uint256 tokenId) external returns (uint256)',
  'function getTokensByOwner(address owner) external view returns (uint256[] memory)',
];

// ─── Initialization ──────────────────────────────────────────────────────────

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
}

function getBackendWallet() {
  if (!backendWallet && BACKEND_PRIVATE_KEY) {
    const p = getProvider();
    backendWallet = new ethers.Wallet(BACKEND_PRIVATE_KEY, p);
  }
  return backendWallet;
}

// ─── Contract Helpers ────────────────────────────────────────────────────────

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

// ─── Auction Operations ─────────────────────────────────────────────────────

export async function createAuction(questionHash, minimumStake, duration) {
  const contract = getAuctionManagerContract();
  const tx = await contract.createAuction(questionHash, minimumStake, duration);
  const receipt = await tx.wait();
  // Extract auctionId from AuctionCreated event
  const event = receipt.logs.find(
    (log) => log.address.toLowerCase() === AUCTION_MANAGER_ADDR.toLowerCase()
  );
  const iface = new ethers.Interface(AuctionManagerABI);
  const parsed = iface.parseLog({ topics: event.topics, data: event.data });
  return { auctionId: parsed.args.auctionId.toString(), txHash: tx.hash };
}

export async function closeBidding(auctionId) {
  const contract = getAuctionManagerContract();
  const tx = await contract.closeBidding(auctionId);
  await tx.wait();
  return { txHash: tx.hash };
}

export async function setShortlist(auctionId, finalists) {
  const contract = getAuctionManagerContract();
  const tx = await contract.setShortlist(auctionId, finalists);
  await tx.wait();
  return { txHash: tx.hash };
}

export async function resolveAuction(auctionId, winner, winningScore, metadataURI, oracleSignature) {
  const contract = getAuctionManagerContract();
  const tx = await contract.resolveAuction(auctionId, winner, winningScore, metadataURI, oracleSignature);
  const receipt = await tx.wait();
  return { txHash: tx.hash };
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

export async function getAuctionCount() {
  const contract = getAuctionManagerContract();
  const count = await contract.auctionCount();
  return count.toString();
}

// ─── Market Operations ───────────────────────────────────────────────────────

export async function createMarket(tokenId, question, options, bettingDuration, feeBps) {
  const contract = getMarketFactoryContract();
  const tx = await contract.createMarket(tokenId, question, options, bettingDuration, feeBps);
  const receipt = await tx.wait();
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
  const tx = await contract.resolveMarket(winningOptionIndex, oracleSignature);
  await tx.wait();
  return { txHash: tx.hash };
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
