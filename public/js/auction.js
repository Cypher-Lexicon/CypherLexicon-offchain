/**
 * auction.js — On-Chain Auction Lifecycle (Phase 1)
 *
 * Manages the full Web3 auction flow:
 *   Create → Bidding Open → Close Bidding → AI Filter
 *   → Set Shortlist → Oracle Resolve → Mint Token
 *
 * Requires a connected wallet (Web3Client) and backend APIs.
 */

const AuctionFlow = {
  currentAuctionId: null,
  currentWinnerData: null,  // from the translation arena

  // ─── Init ──────────────────────────────────────────────────

  /** Called by app.js after DOM is ready */
  init() {
    // Listen for winner from the translation arena
    onAuctionWinnerReady = (data) => {
      this.currentWinnerData = data;
      this._updatePushButton();
    };

    // Wallet connection button
    const connectBtn = document.getElementById('btn-connect-wallet');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.connectWallet());
    }

    // Push to chain button
    const pushBtn = document.getElementById('btn-push-to-chain');
    if (pushBtn) {
      pushBtn.addEventListener('click', () => this.pushToChain());
    }

    // Lifecycle step buttons
    const closeBtn = document.getElementById('btn-close-bidding');
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeBidding());

    const filterBtn = document.getElementById('btn-filter-auction');
    if (filterBtn) filterBtn.addEventListener('click', () => this.filterAuction());

    const resolveBtn = document.getElementById('btn-resolve-auction');
    if (resolveBtn) resolveBtn.addEventListener('click', () => this.resolveAuction());

    // Refresh auction button
    const refreshBtn = document.getElementById('btn-refresh-auction');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshAuction());
  },

  // ─── Wallet Connection ─────────────────────────────────────

  async connectWallet() {
    try {
      const { address, chainId } = await Web3Client.connect();
      this._renderWalletState();
      UI.log(`Wallet connected: ${Web3Client.shortAddress()} on ${Web3Client.networkName()}`);
      UI.toast('Wallet connected successfully!', 'success');

      // Load tokens owned by this address for market creation
      if (typeof MarketFlow !== 'undefined' && MarketFlow.refreshTokens) {
        MarketFlow.refreshTokens();
      }
    } catch (err) {
      UI.log(`Wallet connection failed: ${err.message}`);
      UI.toast(err.message, 'error');
    }
  },

  _renderWalletState() {
    const container = document.getElementById('web3-wallet-state');
    if (!container) return;

    if (Web3Client.connected) {
      container.innerHTML = `
        <div class="web3-status-row">
          <span class="info-label">ADDRESS</span>
          <span class="web3-address">${Web3Client.shortAddress()}</span>
        </div>
        <div class="web3-status-row">
          <span class="info-label">NETWORK</span>
          <span class="web3-network">${Web3Client.networkName()}</span>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="AuctionFlow.disconnectWallet()">DISCONNECT</button>
      `;
    } else {
      container.innerHTML = `
        <div class="web3-status-row">
          <span class="info-label" style="color: var(--terminal-red)">NOT CONNECTED</span>
          <span>---</span>
        </div>
      `;
    }

    this._updatePushButton();
  },

  disconnectWallet() {
    Web3Client.disconnect();
    this._renderWalletState();
    UI.log('Wallet disconnected.');
  },

  // ─── Push Translation Winner to Chain ─────────────────────

  _updatePushButton() {
    const btn = document.getElementById('btn-push-to-chain');
    if (!btn) return;
    btn.disabled = !(this.currentWinnerData && Web3Client.connected);
  },

  async pushToChain() {
    if (!this.currentWinnerData) {
      UI.toast('Run a translation auction first.', 'info');
      return;
    }
    if (!Web3Client.connected) {
      UI.toast('Connect your wallet first.', 'error');
      return;
    }

    const winner = this.currentWinnerData.agents[this.currentWinnerData.winner_index];
    const questionHash = ethers.keccak256(ethers.toUtf8Bytes(winner.response.title));
    const minimumStake = 100;
    const duration = 3600; // 1 hour

    try {
      UI.log(`Creating on-chain auction for: ${winner.response.title.substring(0, 60)}...`);
      UI.toast('Creating on-chain auction...', 'info');

      const result = await API.createAuction(questionHash, minimumStake, duration);
      this.currentAuctionId = parseInt(result.auctionId);

      UI.setText('auction-id-display', `#${result.auctionId}`);
      UI.setText('auction-tx-hash', result.txHash);
      UI.setText('auction-question', winner.response.title);

      UI.log(`Auction #${result.auctionId} created on-chain. Tx: ${result.txHash}`);
      UI.toast(`Auction #${result.auctionId} created!`, 'success');

      this._updateLifecycle(0); // CREATED
      this._updateLifecycle(1); // BIDDING_OPEN

      UI.switchTab('auction');
      this._enableLifecycleButtons(true);
    } catch (err) {
      UI.log(`Push to chain failed: ${err.message}`);
      UI.toast(`Failed: ${err.message}`, 'error');
    }
  },

  // ─── Lifecycle Steps ───────────────────────────────────────

  async closeBidding() {
    if (!this.currentAuctionId) return;
    try {
      UI.log(`Closing bidding for Auction #${this.currentAuctionId}...`);
      await API.closeBidding(this.currentAuctionId);
      this._updateLifecycle(2); // BIDDING_CLOSED
      UI.log(`Bidding closed for Auction #${this.currentAuctionId}`);
      UI.toast('Bidding closed.', 'info');
    } catch (err) {
      UI.toast(`Close bidding failed: ${err.message}`, 'error');
    }
  },

  async filterAuction() {
    if (!this.currentAuctionId) return;
    try {
      UI.log(`Running AI filter for Auction #${this.currentAuctionId}...`);
      const result = await API.filterAuction(this.currentAuctionId);
      this._updateLifecycle(3); // SHORTLIST_SET
      UI.log(`Shortlist set with ${result.finalists.length} finalists.`);
      UI.toast(`${result.finalists.length} bidders shortlisted.`, 'success');
    } catch (err) {
      UI.toast(`Filter failed: ${err.message}`, 'error');
    }
  },

  async resolveAuction() {
    if (!this.currentAuctionId || !Web3Client.connected) return;

    const winnerAddr = Web3Client.walletAddress;
    const winningScore = 8750; // from the simulation score * 10000

    if (this.currentWinnerData) {
      const winner = this.currentWinnerData.agents[this.currentWinnerData.winner_index];
      const metadataURI = `ipfs://cypher-lexicon/auction-${this.currentAuctionId}-${winner.name}`;

      try {
        UI.log(`Resolving Auction #${this.currentAuctionId} with oracle signature...`);
        await API.resolveAuction(this.currentAuctionId, winnerAddr, winningScore, metadataURI);
        this._updateLifecycle(4); // COMPLETED
        UI.log(`Auction #${this.currentAuctionId} resolved! Winner: ${winner.name}, token minted.`);
        UI.toast('Auction resolved and token minted!', 'success');

        // Refresh tokens for market creation
        if (typeof MarketFlow !== 'undefined' && MarketFlow.refreshTokens) {
          MarketFlow.refreshTokens();
        }
      } catch (err) {
        UI.toast(`Resolve failed: ${err.message}`, 'error');
      }
    }
  },

  async refreshAuction() {
    if (!this.currentAuctionId) return;
    try {
      const auction = await API.getAuction(this.currentAuctionId);
      const stateMap = { 'INACTIVE': 0, 'BIDDING_OPEN': 1, 'BIDDING_CLOSED': 2, 'SHORTLIST_SET': 3, 'COMPLETED': 4 };
      const stateIdx = stateMap[auction.state] || 0;

      for (let i = 0; i <= stateIdx; i++) this._updateLifecycle(i);

      UI.setText('auction-id-display', `#${this.currentAuctionId}`);
      UI.setText('auction-question', auction.questionHash || '---');

      if (auction.bidders && auction.bidders.length) {
        UI.setText('auction-bidder-count', `${auction.bidders.length} bidders`);
      }
      UI.log(`Auction #${this.currentAuctionId} state refreshed: ${auction.state}`);
    } catch (err) {
      UI.log(`Refresh failed: ${err.message}`);
    }
  },

  // ─── Lifecycle UI ─────────────────────────────────────────

  _updateLifecycle(stepIndex) {
    const steps = document.querySelectorAll('.lifecycle-step');
    steps.forEach((step, i) => {
      step.classList.remove('active', 'complete');
      if (i <= stepIndex) {
        step.classList.add(i === stepIndex ? 'active' : 'complete');
      }
    });

    const labels = ['created', 'bidding', 'closed', 'shortlisted', 'completed'];
    UI.log(`Auction lifecycle: ${labels[stepIndex] || 'unknown'}`);

    // Enable/disable buttons based on state
    UI.setDisabled('btn-close-bidding', stepIndex < 1);
    UI.setDisabled('btn-filter-auction', stepIndex < 2);
    UI.setDisabled('btn-resolve-auction', stepIndex < 3);
  },

  _enableLifecycleButtons(enable) {
    if (!enable) {
      for (let i = 0; i < 5; i++) {
        const steps = document.querySelectorAll('.lifecycle-step');
        steps.forEach(s => { s.classList.remove('active', 'complete'); });
      }
    }
    UI.setDisabled('btn-close-bidding', !enable);
    UI.setDisabled('btn-filter-auction', !enable);
    UI.setDisabled('btn-resolve-auction', !enable);
  }
};
