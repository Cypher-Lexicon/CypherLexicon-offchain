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
  usdcAddress: null,

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

  // ─── USDC Helpers ───────────────────────────────────────

  /** Get the USDC contract instance (read-only via provider) */
  getUSDCContract() {
    if (!this.usdcAddress) throw new Error('USDC address not loaded from backend');
    return this.getProviderContract(this.usdcAddress, ERC20_ABI);
  },

  /** Get USDC balance for the connected wallet */
  async getUSDCBalance() {
    const usdc = this.getUSDCContract();
    const decimals = await usdc.decimals();
    const raw = await usdc.balanceOf(this.walletAddress);
    return { raw, formatted: ethers.formatUnits(raw, decimals), decimals: Number(decimals) };
  },

  /**
   * Approve USDC spending for a spender address.
   * Returns the tx receipt, or null if allowance is already sufficient.
   */
  async approveUSDC(spender, amountWei) {
    if (!this.signer) throw new Error('Wallet not connected');
    if (!this.usdcAddress) throw new Error('USDC address not loaded');

    const usdc = new ethers.Contract(this.usdcAddress, ERC20_ABI, this.signer);

    // Check current allowance
    const allowance = await usdc.allowance(this.walletAddress, spender);
    if (allowance >= amountWei) {
      return null; // Already approved
    }

    UI.log(`Requesting USDC approval for ${ethers.formatUnits(amountWei, 6)} USDC...`);
    const tx = await usdc.approve(spender, amountWei);
    UI.log(`Approval tx submitted: ${tx.hash.slice(0, 10)}...`);
    const receipt = await tx.wait();
    UI.log(`USDC approval confirmed in block ${receipt.blockNumber}`);
    return receipt;
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
};

// Global callback for wallet changes (set by app.js)
let onWalletChanged = null;

// ─── Contract ABIs (human-readable, ethers v6 compatible) ───────────

/** ERC20 minimal ABI for USDC approve / allowance / balanceOf */
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function balanceOf(address account) external view returns (uint256)',
];

/** PredictionMarket ABI — mirrors the on-chain contract interface */
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
  'function claimWinnings() external returns (uint256)',
  'function claimPublisherFees() external returns (uint256)',
];
