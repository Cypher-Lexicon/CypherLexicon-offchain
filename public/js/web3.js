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
  }
};

// Global callback for wallet changes (set by app.js)
let onWalletChanged = null;
