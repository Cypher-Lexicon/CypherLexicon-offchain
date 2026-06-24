/**
 * auction.js — On-Chain Auction Lifecycle (Phase 1)
 *
 * Full Web3 auction flow aligned with AuctionManager.sol:
 *   Create Auction → Users Place Bids (USDC stake + proposal)
 *   → Close Bidding → AI Filter → Set Shortlist
 *   → Oracle Resolve → Mint Token → Non-winners Withdraw
 *
 * Requires a connected wallet (Web3Client) and backend APIs.
 */

const AuctionFlow = {
  currentAuctionId: null,
  currentWinnerData: null,  // from the translation arena

  // ─── Init ──────────────────────────────────────────────────

  /** Called by app.js after DOM is ready */
  init() {
    // Store winner data from the translation arena (no button action needed)
    onAuctionWinnerReady = (data) => {
      this.currentWinnerData = data;
    };

    // Wallet connection button
    const connectBtn = document.getElementById('btn-connect-wallet');
    if (connectBtn) {
      connectBtn.addEventListener('click', () => this.connectWallet());
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

    // Bidding buttons
    const bidBtn = document.getElementById('btn-place-bid');
    if (bidBtn) bidBtn.addEventListener('click', () => this.placeBid());

    const loadBiddersBtn = document.getElementById('btn-load-bidders');
    if (loadBiddersBtn) loadBiddersBtn.addEventListener('click', () => this.loadBidders());

    const withdrawBtn = document.getElementById('btn-withdraw-stake');
    if (withdrawBtn) withdrawBtn.addEventListener('click', () => this.withdrawStake());
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
  },

  disconnectWallet() {
    Web3Client.disconnect();
    this._renderWalletState();
    UI.log('Wallet disconnected.');
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
      UI.log(`Running two-stage filter for Auction #${this.currentAuctionId} (pre-filter + AI)...`);
      const result = await API.filterAuction(this.currentAuctionId);
      this._updateLifecycle(3); // SHORTLIST_SET
      UI.log(`Shortlist set with ${result.finalists.length} finalists.`);
      UI.toast(`${result.finalists.length} bidders shortlisted.`, 'success');
    } catch (err) {
      UI.toast(`Filter failed: ${err.message}`, 'error');
    }
  },

  /**
   * Expert evaluation is done manually via curl:
   *   curl -X POST http://localhost:3000/api/auctions/:id/evaluate
   * The resolve button auto-fetches the result when clicked.
   */

  async resolveAuction() {
    if (!this.currentAuctionId || !Web3Client.connected) return;

    // Auto-fetch evaluation result if not already cached
    if (!this.expertResult?.winner) {
      try {
        UI.log('Fetching evaluation result from API...');
        this.expertResult = await API.evaluateAuction(this.currentAuctionId);
        this._updateLifecycle(4); // EVALUATED
        UI.log(`Evaluation loaded: winner ${this.expertResult.winner.address.slice(0, 10)}... (score ${this.expertResult.winner.score.toFixed(3)})`);
      } catch (e) {
        UI.toast('Run evaluation first: curl -X POST http://localhost:3000/api/auctions/' + this.currentAuctionId + '/evaluate', 'error');
        return;
      }
    }

    const ew = this.expertResult.winner;
    const winnerAddr = ew.address;
    const winningScore = ew.winningScore;
    const metadataURI = `ipfs://cypher-lexicon/auction-${this.currentAuctionId}-heuristic`;

    try {
      UI.log(`Resolving Auction #${this.currentAuctionId} with oracle signature...`);
      UI.log(`Winner: ${winnerAddr.slice(0, 10)}... | Score: ${winningScore}`);
      await API.resolveAuction(this.currentAuctionId, winnerAddr, winningScore, metadataURI);
      this._updateLifecycle(5); // COMPLETED
      UI.log(`Auction #${this.currentAuctionId} resolved! Token minted to winner.`);
      UI.toast('Auction resolved and token minted!', 'success');

      // Refresh tokens for market creation
      if (typeof MarketFlow !== 'undefined' && MarketFlow.refreshTokens) {
        MarketFlow.refreshTokens();
      }
    } catch (err) {
      UI.toast(`Resolve failed: ${err.message}`, 'error');
    }
  },

  // ─── Bidding ──────────────────────────────────────────────

  /**
   * Place a bid on an auction. Per AuctionManager.sol:
   * 1. User approves USDC spending for the AuctionManager contract
   * 2. User calls placeBid(auctionId, stakeAmount, proposalHash)
   * Bids are additive — multiple calls accumulate stake.
   */
  async placeBid() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'error');
      return;
    }
    if (!Web3Client.auctionManagerAddress) {
      UI.toast('AuctionManager address not loaded. Check backend.', 'error');
      return;
    }

    const auctionIdStr = UI.getValue('bid-auction-id');
    const stakeStr = UI.getValue('bid-stake-amount');
    const proposalHash = UI.getValue('bid-proposal') || `ipfs://bid-${auctionIdStr}-${Date.now()}`;
    const auctionId = parseInt(auctionIdStr);

    if (!auctionId || isNaN(auctionId)) {
      UI.toast('Enter a valid auction ID.', 'error');
      return;
    }
    if (!stakeStr || parseFloat(stakeStr) <= 0) {
      UI.toast('Enter a valid stake amount.', 'error');
      return;
    }

    const statusEl = document.getElementById('auction-bid-status');
    const btn = document.getElementById('btn-place-bid');

    try {
      UI.setDisabled('btn-place-bid', true);
      if (btn) btn.textContent = '...';

      // Parse USDC amount
      const usdc = Web3Client.getUSDCContract();
      const decimals = await usdc.decimals();
      const stakeWei = ethers.parseUnits(stakeStr, decimals);

      // Step 1: Approve USDC for AuctionManager
      if (statusEl) statusEl.textContent = 'Checking USDC allowance...';
      UI.log(`Approving USDC for AuctionManager at ${Web3Client.auctionManagerAddress.slice(0, 10)}...`);

      const approvalReceipt = await Web3Client.approveUSDC(Web3Client.auctionManagerAddress, stakeWei);
      if (approvalReceipt) {
        UI.toast('USDC approved for bidding.', 'success');
      }

      // Step 2: Place bid on AuctionManager
      if (statusEl) statusEl.textContent = 'Placing bid on-chain...';
      UI.log(`Placing bid: ${stakeStr} USDC on Auction #${auctionId}...`);

      const auctionMgr = Web3Client.getAuctionManagerSigner();
      const tx = await auctionMgr.placeBid(auctionId, stakeWei, proposalHash);
      UI.toast('Bid submitted. Waiting for confirmation...', 'info');
      if (statusEl) statusEl.textContent = `Tx: ${tx.hash.slice(0, 10)}...`;

      const receipt = await tx.wait();

      UI.log(`Bid confirmed in block ${receipt.blockNumber}! ${stakeStr} USDC staked on Auction #${auctionId}`);
      UI.toast(`Bid of ${stakeStr} USDC placed on Auction #${auctionId}!`, 'success');
      if (statusEl) statusEl.textContent = `Confirmed in block ${receipt.blockNumber}`;

      // Refresh bidders list
      await this.loadBidders();

    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Bid failed: ${msg}`);
      UI.toast(`Bid failed: ${msg}`, 'error');
      if (statusEl) statusEl.textContent = `Error: ${msg}`;
    } finally {
      UI.setDisabled('btn-place-bid', false);
      if (btn) btn.textContent = 'PLACE BID';
    }
  },

  /** Load and display all bidders for the current auction */
  async loadBidders() {
    const auctionIdStr = UI.getValue('bid-auction-id');
    if (!auctionIdStr) {
      // Try currentAuctionId
      if (this.currentAuctionId) {
        UI.setValue('bid-auction-id', this.currentAuctionId);
      } else {
        UI.toast('Enter an auction ID first.', 'info');
        return;
      }
    }

    const auctionId = parseInt(UI.getValue('bid-auction-id'));
    if (!auctionId) return;

    const container = document.getElementById('auction-bidders-list');
    if (!container) return;

    try {
      const auctionMgr = Web3Client.getAuctionManagerProvider();
      const bidders = await auctionMgr.getBidders(auctionId);

      if (!bidders || bidders.length === 0) {
        container.innerHTML = '<span style="color:#6b7280;">No bidders yet.</span>';
        return;
      }

      const usdc = Web3Client.getUSDCContract();
      const decimals = await usdc.decimals();

      // Fetch stakes and shortlist status for each bidder
      const rows = await Promise.all(bidders.map(async (addr) => {
        const stakeRaw = await auctionMgr.getBidderStake(auctionId, addr);
        const shortlisted = await auctionMgr.isShortlisted(auctionId, addr);
        const withdrawn = await auctionMgr.stakeWithdrawn(auctionId, addr);
        const stake = ethers.formatUnits(stakeRaw, decimals);
        const short = addr.slice(0, 6) + '...' + addr.slice(-4);
        let flags = '';
        if (shortlisted) flags += ' ⭐';
        if (withdrawn) flags += ' 💸';
        return `<div style="padding:2px 0;">${short}: <span style="color:var(--terminal-green);">${parseFloat(stake).toFixed(2)} USDC</span>${flags}</div>`;
      }));

      container.innerHTML = rows.join('');
      UI.log(`Loaded ${bidders.length} bidders for Auction #${auctionId}.`);
    } catch (err) {
      container.innerHTML = `<span style="color:var(--terminal-red);">Error: ${err.message}</span>`;
      UI.log(`Failed to load bidders: ${err.message}`);
    }
  },

  /**
   * Non-winners withdraw their staked USDC after auction resolution.
   * Per AuctionManager.sol: winner's stake stays as payment; non-winners withdraw.
   */
  async withdrawStake() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'error');
      return;
    }

    const auctionIdStr = UI.getValue('bid-auction-id');
    if (!auctionIdStr && this.currentAuctionId) {
      UI.setValue('bid-auction-id', this.currentAuctionId);
    }
    const auctionId = parseInt(UI.getValue('bid-auction-id'));
    if (!auctionId || isNaN(auctionId)) {
      UI.toast('Enter a valid auction ID.', 'error');
      return;
    }

    try {
      UI.log(`Withdrawing stake from Auction #${auctionId}...`);
      const auctionMgr = Web3Client.getAuctionManagerSigner();
      const tx = await auctionMgr.withdrawStake(auctionId);
      UI.toast('Withdraw submitted. Waiting for confirmation...', 'info');
      const receipt = await tx.wait();

      UI.log(`Stake withdrawn in block ${receipt.blockNumber}.`);
      UI.toast('Stake withdrawn successfully!', 'success');

      // Refresh bidders
      await this.loadBidders();
    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Withdraw failed: ${msg}`);
      UI.toast(`Withdraw failed: ${msg}`, 'error');
    }
  },

  async refreshAuction() {
    if (!this.currentAuctionId) return;
    try {
      const auction = await API.getAuction(this.currentAuctionId);
      const stateMap = { 'INACTIVE': 0, 'BIDDING_OPEN': 1, 'BIDDING_CLOSED': 2, 'SHORTLIST_SET': 3, 'COMPLETED': 5 };
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

    const labels = ['created', 'bidding', 'closed', 'shortlisted', 'evaluated', 'completed'];
    UI.log(`Auction lifecycle: ${labels[stepIndex] || 'unknown'}`);

    // Enable/disable buttons based on state
    UI.setDisabled('btn-close-bidding', stepIndex < 1);
    UI.setDisabled('btn-filter-auction', stepIndex < 2);
    UI.setDisabled('btn-resolve-auction', stepIndex < 4);
  },

  _enableLifecycleButtons(enable) {
    if (!enable) {
      const steps = document.querySelectorAll('.lifecycle-step');
      steps.forEach(s => { s.classList.remove('active', 'complete'); });
    }
    UI.setDisabled('btn-close-bidding', !enable);
    UI.setDisabled('btn-filter-auction', !enable);
    UI.setDisabled('btn-resolve-auction', !enable);
  }
};
