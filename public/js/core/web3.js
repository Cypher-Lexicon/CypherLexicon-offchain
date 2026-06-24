/**
 * web3.js — Browser Wallet & Direct Contract Interaction
 *
 * Manages MetaMask / injected provider connection and provides
 * direct read/write access to on-chain contracts via ethers.js v6
 * (loaded from CDN in index.html).
 */

const Web3Client = {
  provider: null,
  signer: null,
  walletAddress: null,
  chainId: null,
  connected: false,

  // ─── Contract Addresses (cached from backend) ────────────
  // usdcAddress removed — contracts now use native currency (ARC)

  auctionManagerAddress: null,
  marketFactoryAddress: null,

  // ─── Initialization ────────────────────────────────────────

  /** Check if window.ethereum is available */
  isAvailable() {
    return typeof window.ethereum !== 'undefined';
  },

  /** Connect to the browser wallet */
  async connect() {
    if (!this.isAvailable()) {
      throw new Error('No Web3 wallet detected. Please install MetaMask or another Ethereum wallet.');
    }

    this.provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await this.provider.send('eth_requestAccounts', []);
    this.signer = await this.provider.getSigner();
    this.walletAddress = accounts[0];

    const network = await this.provider.getNetwork();
    this.chainId = Number(network.chainId);
    this.connected = true;

    // Listen for account/chain changes
    window.ethereum.on('accountsChanged', (accs) => {
      this.walletAddress = accs[0] || null;
      this.connected = !!accs[0];
      if (typeof onWalletChanged === 'function') onWalletChanged();
    });

    window.ethereum.on('chainChanged', () => {
      // Reload recommended on chain change
      window.location.reload();
    });

    return { address: this.walletAddress, chainId: this.chainId };
  },

  /** Disconnect (just clear state; MetaMask has no programmatic disconnect) */
  disconnect() {
    this.provider = null;
    this.signer = null;
    this.walletAddress = null;
    this.chainId = null;
    this.connected = false;
  },

  /** Get short display of address */
  shortAddress() {
    if (!this.walletAddress) return '---';
    return `${this.walletAddress.slice(0, 6)}...${this.walletAddress.slice(-4)}`;
  },

  /** Get network name from chain ID */
  networkName() {
    const names = {
      1: 'Ethereum Mainnet',
      5: 'Goerli Testnet',
      11155111: 'Sepolia Testnet',
      137: 'Polygon Mainnet',
      80001: 'Mumbai Testnet',
      42161: 'Arbitrum One',
      421613: 'Arbitrum Goerli',
      8453: 'Base Mainnet',
      84531: 'Base Goerli',
      666: 'Arc Testnet'
    };
    return names[this.chainId] || `Chain ${this.chainId}`;
  },

  // ─── Contract Helpers (read-only via provider) ────────────

  /** Get contract instance via signer (for write txs) */
  getSignerContract(address, abi) {
    if (!this.signer) throw new Error('Wallet not connected');
    return new ethers.Contract(address, abi, this.signer);
  },

  /** Get contract instance via provider (for read calls) */
  getProviderContract(address, abi) {
    if (!this.provider) throw new Error('Wallet not connected');
    return new ethers.Contract(address, abi, this.provider);
  },

  // ─── Prediction Market Helpers ───────────────────────────

  /** Get a PredictionMarket contract instance (with signer for writes) */
  getPredictionMarketSigner(marketAddress) {
    return this.getSignerContract(marketAddress, PredictionMarketABI);
  },

  /** Get a PredictionMarket contract instance (read-only) */
  getPredictionMarketProvider(marketAddress) {
    return this.getProviderContract(marketAddress, PredictionMarketABI);
  },

  // ─── Auction Manager Helpers ─────────────────────────────

  // Cached from backend status
  auctionManagerAddress: null,

  /** Get an AuctionManager contract instance (with signer for writes) */
  getAuctionManagerSigner() {
    if (!this.auctionManagerAddress) throw new Error('AuctionManager address not loaded');
    return this.getSignerContract(this.auctionManagerAddress, AuctionManagerABI);
  },

  /** Get an AuctionManager contract instance (read-only) */
  getAuctionManagerProvider() {
    if (!this.auctionManagerAddress) throw new Error('AuctionManager address not loaded');
    return this.getProviderContract(this.auctionManagerAddress, AuctionManagerABI);
  },

  // ─── Market Factory Helpers ────────────────────────────

  /** Get a MarketFactory contract instance (with signer for writes) */
  getMarketFactorySigner() {
    if (!this.marketFactoryAddress) throw new Error('MarketFactory address not loaded');
    return this.getSignerContract(this.marketFactoryAddress, MarketFactoryABI);
  },
};

// Global callback for wallet changes (set by app.js)
let onWalletChanged = null;

// ─── Contract ABIs (human-readable, ethers v6 compatible) ───────────

/** AuctionManager ABI — mirrors the on-chain contract interface */
const AuctionManagerABI = [
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

/** PredictionMarket ABI — mirrors the on-chain contract interface */
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

/** MarketFactory ABI — deploys new prediction markets */
const MarketFactoryABI = [
  'event MarketDeployed(address indexed marketAddress, uint256 indexed tokenId, address indexed publisher)',
  'function createMarket(uint256 tokenId, string question, string[] options, uint256 bettingDuration, uint256 feeBps) external returns (address)',
  'function getDeployedMarkets() external view returns (address[] memory)',
  'function tokenToMarket(uint256 tokenId) external view returns (address)',
];
