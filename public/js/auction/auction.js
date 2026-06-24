/**
 * auction/auction.js — AUCTION PHASE (Phase 1)
 *
 * Split into two sub-tabs within the auction panel:
 *   SUB-TAB 1 — AuctionCreate: Operator-only auction creation (gated by .env whitelist)
 *   SUB-TAB 2 — AuctionList: Public auction listing with bid/browse functionality
 *
 * The dapp operator manually closes the auction at end of day.
 * The winner receives a PublishingRightsNFT token, enabling them to create a market.
 */

// ═══════════════════════════════════════════════════════════
//  Auction Sub-Tab Navigation (within the auction panel)
// ═══════════════════════════════════════════════════════════

const AuctionSubTabs = {
  _init() {
    document.querySelectorAll('#tab-auction .auc-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subtab = btn.getAttribute('data-auc-subtab');
        this._switchTo(subtab);
        if (subtab === 'create') {
          AuctionCreate._renderWalletState();
          AuctionCreate.checkOperator();
        }
        if (subtab === 'list') {
          AuctionList._renderWalletState();
          AuctionList.loadAuctions();
        }
        UI.log(`Switched to Auction ${subtab} sub-tab.`);
      });
    });
  },

  _switchTo(subtab) {
    document.querySelectorAll('#tab-auction .auc-subtab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#tab-auction .auc-subtab-panel').forEach(p => p.classList.remove('active'));

    const btn = document.querySelector(`#tab-auction .auc-subtab-btn[data-auc-subtab="${subtab}"]`);
    const panel = document.getElementById(`auc-subtab-${subtab}`);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.add('active');
  }
};


// ═══════════════════════════════════════════════════════════
//  AuctionCreate — OPERATOR-ONLY: Create & manage auctions
// ═══════════════════════════════════════════════════════════

const AuctionCreate = {
  currentAuctionId: null,
  currentAuction: null,
  _evalResult: null,
  isOperator: false,

  init() {
    // Wallet connect
    const connectBtn = document.getElementById('btn-auc-create-connect');
    if (connectBtn) connectBtn.addEventListener('click', () => this.connectWallet());

    // Auction refresh
    const refreshBtn = document.getElementById('btn-auction-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.refreshAuction());

    // Load auction by ID
    const loadBtn = document.getElementById('btn-auction-load');
    if (loadBtn) loadBtn.addEventListener('click', () => this.loadAuctionById());

    // Create auction (OPERATOR ONLY)
    const createBtn = document.getElementById('btn-auction-create');
    if (createBtn) createBtn.addEventListener('click', () => this.createAuctionViaAPI());

    // Close auction (manual)
    const closeBtn = document.getElementById('btn-auction-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.manualCloseAuction());

    // Filter shortlist
    const filterBtn = document.getElementById('btn-auction-filter');
    if (filterBtn) filterBtn.addEventListener('click', () => this.filterAuction());

    // Evaluate
    const evalBtn = document.getElementById('btn-auction-evaluate');
    if (evalBtn) evalBtn.addEventListener('click', () => this.evaluateAuction());

    // Resolve & mint token
    const resolveBtn = document.getElementById('btn-auction-resolve');
    if (resolveBtn) resolveBtn.addEventListener('click', () => this.resolveAuction());

    // Operator auction list refresh
    const opRefreshBtn = document.getElementById('btn-auc-create-list-refresh');
    if (opRefreshBtn) opRefreshBtn.addEventListener('click', () => this.loadOperatorAuctions());
  },

  // ─── Wallet ──────────────────────────────────────────────

  async connectWallet() {
    try {
      const { address, chainId } = await Web3Client.connect();
      this._renderWalletState();
      await this.checkOperator();
      UI.log(`Operator wallet connected: ${Web3Client.shortAddress()} on ${Web3Client.networkName()}`);
      UI.toast('Wallet connected!', 'success');
      if (typeof MarketFlow !== 'undefined' && MarketFlow.refreshTokens) {
        MarketFlow.refreshTokens();
      }
    } catch (err) {
      UI.log(`Wallet connection failed: ${err.message}`);
      UI.toast(err.message, 'error');
    }
  },

  _renderWalletState() {
    const container = document.getElementById('auc-create-wallet-state');
    if (!container) return;

    if (Web3Client.connected) {
      const opStatus = this.isOperator ? ' (AUTHORIZED)' : ' (UNAUTHORIZED)';
      container.innerHTML = `
        <div class="web3-status-row">
          <span class="info-label">ADDRESS</span>
          <span class="web3-address">${Web3Client.shortAddress()}${opStatus}</span>
        </div>
        <div class="web3-status-row">
          <span class="info-label">NETWORK</span>
          <span class="web3-network">${Web3Client.networkName()}</span>
        </div>
        <button class="btn btn-sm btn-secondary" style="width:100%;" onclick="AuctionCreate.disconnectWallet()">DISCONNECT</button>
      `;
    } else {
      container.innerHTML = `
        <div class="web3-status-row">
          <span style="color:var(--terminal-red)">NOT CONNECTED</span>
          <span>---</span>
        </div>
      `;
    }
  },

  disconnectWallet() {
    Web3Client.disconnect();
    this.isOperator = false;
    this._renderWalletState();
    this._updateOperatorUI();
    UI.log('Wallet disconnected.');
  },

  // ─── Operator Check ──────────────────────────────────────

  async checkOperator() {
    if (!Web3Client.connected) {
      this.isOperator = false;
      this._updateOperatorUI();
      return;
    }

    try {
      const result = await API.checkOperator(Web3Client.walletAddress);
      this.isOperator = result.isOperator;
      UI.log(`Operator status: ${this.isOperator ? 'AUTHORIZED' : 'not authorized'}`);
    } catch (err) {
      this.isOperator = false;
      console.warn('Operator check failed:', err.message);
    }
    this._renderWalletState();
    this._updateOperatorUI();
  },

  _updateOperatorUI() {
    const createPanel = document.getElementById('auc-create-form-panel');
    const unauthorized = document.getElementById('auc-create-unauthorized');
    const opListSection = document.getElementById('auc-create-list-section');

    if (this.isOperator) {
      if (createPanel) createPanel.style.display = '';
      if (unauthorized) unauthorized.style.display = 'none';
      if (opListSection) opListSection.style.display = '';
      // Load the operator auction list when operator is verified
      this.loadOperatorAuctions();
    } else {
      if (createPanel) createPanel.style.display = 'none';
      if (unauthorized) unauthorized.style.display = '';
      if (opListSection) opListSection.style.display = 'none';
      // Also hide detail/lifecycle panel for non-operators
      const detail = document.getElementById('auc-create-detail');
      if (detail) detail.style.display = 'none';
    }
  },

  // ─── Create Auction ──────────────────────────────────────

  /** Format Unix timestamp to YYYY-MM-DD HH:mm:ss UTC */
  _formatDeadline(ts) {
    if (!ts) return '---';
    const d = new Date(parseInt(ts) * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  },

  async createAuctionViaAPI() {
    if (!this.isOperator) {
      UI.toast('Only whitelisted operators can create auctions.', 'error');
      return;
    }

    const minStake = UI.getValue('auction-create-min-stake');
    const duration = UI.getValue('auction-create-duration');

    if (!minStake || !duration) { UI.toast('Enter minimum stake and duration.', 'error'); return; }

    const btn = document.getElementById('btn-auction-create');

    try {
      UI.setDisabled('btn-auction-create', true);
      if (btn) btn.textContent = 'CREATING...';

      UI.log(`Creating auction: ${minStake} ARC min stake, ${duration}s duration`);
      const result = await API.createAuction(
        minStake, duration, Web3Client.walletAddress
      );
      this.currentAuctionId = result.auctionId;
      this.currentAuction = result;

      // Show the detail/lifecycle panel
      const detail = document.getElementById('auc-create-detail');
      if (detail) detail.style.display = '';

      UI.setText('auction-id-display', `#${result.auctionId}`);
      UI.setText('auction-min-stake-display', `${minStake} ARC`);
      UI.setText('auction-deadline-display', this._formatDeadline(result.biddingEndTime));
      UI.hide('auction-winner-section');

      this._updateLifecycle(1); // BIDDING_OPEN
      // Refresh the operator auction list to include the new auction
      this.loadOperatorAuctions();
      UI.log(`Auction #${result.auctionId} created. Bidding open!`);
      UI.toast(`Auction #${result.auctionId} created!`, 'success');
    } catch (err) {
      UI.log(`Auction creation failed: ${err.message}`);
      UI.toast(`Failed: ${err.message}`, 'error');
    } finally {
      UI.setDisabled('btn-auction-create', false);
      if (btn) btn.textContent = 'CREATE AUCTION';
    }
  },

  // ─── Load Auction ────────────────────────────────────────

  async loadAuctionById() {
    const idStr = UI.getValue('auction-load-id');
    if (!idStr) {
      UI.toast('Enter an auction ID.', 'info');
      return;
    }
    const id = parseInt(idStr);
    if (isNaN(id)) { UI.toast('Invalid auction ID.', 'error'); return; }
    this.currentAuctionId = id;
    await this.refreshAuction();
  },

  async refreshAuction() {
    if (!this.currentAuctionId) return;
    try {
      const auction = await API.getAuction(this.currentAuctionId);
      this.currentAuction = auction;

      const detail = document.getElementById('auc-create-detail');
      if (detail) detail.style.display = '';

      UI.setText('auction-id-display', `#${auction.auctionId}`);
      UI.setText('auction-min-stake-display', `${auction.minimumStake || '---'} ARC`);
      UI.setText('auction-deadline-display', this._formatDeadline(auction.biddingEndTime));
      UI.setText('auction-bidder-count', `${auction.bidderCount || 0}`);

      if (auction.winner && auction.winner !== '0x0000000000000000000000000000000000000000') {
        UI.setText('auction-winner-display', `${auction.winner.slice(0, 10)}...`);
        UI.setText('auction-nft-display', `Token #${auction.nftTokenId || '---'}`);
        const winSection = document.getElementById('auction-winner-section');
        if (winSection) winSection.style.display = '';
      } else {
        const winSection = document.getElementById('auction-winner-section');
        if (winSection) winSection.style.display = 'none';
      }

      // Lifecycle state
      const stateMap = { 'INACTIVE': 0, 'BIDDING_OPEN': 1, 'BIDDING_CLOSED': 2, 'SHORTLIST_SET': 3, 'COMPLETED': 5 };
      const stateIdx = stateMap[auction.state] || 0;
      for (let i = 0; i <= stateIdx; i++) this._updateLifecycle(i);

      // Update operator buttons
      UI.setDisabled('btn-auction-close', stateIdx < 1);
      UI.setDisabled('btn-auction-filter', stateIdx < 2);
      UI.setDisabled('btn-auction-evaluate', stateIdx < 3);
      UI.setDisabled('btn-auction-resolve', stateIdx < 3);

      // Also refresh the operator auction list to show updated states
      this.loadOperatorAuctions();

      UI.log(`Auction #${auction.auctionId} refreshed. State: ${auction.state}`);
    } catch (err) {
      UI.log(`Refresh failed: ${err.message}`);
      UI.toast(`Failed to load auction: ${err.message}`, 'error');
    }
  },

  // ─── Manual Close Bidding ────────────────────────────────

  async manualCloseAuction() {
    if (!this.currentAuctionId) {
      UI.toast('Load an auction first.', 'info');
      return;
    }

    // Check deadline: contract requires block.timestamp >= biddingEndTime
    if (this.currentAuction?.biddingEndTime) {
      const deadline = parseInt(this.currentAuction.biddingEndTime);
      const now = Math.floor(Date.now() / 1000);
      if (now < deadline) {
        const remaining = deadline - now;
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        const s = remaining % 60;
        UI.toast(`Deadline not reached. Wait ${h}h ${m}m ${s}s (${this._formatDeadline(deadline)}).`, 'error');
        return;
      }
    }

    if (!confirm(`Close bidding for Auction #${this.currentAuctionId}? This is irreversible.`)) return;

    try {
      UI.log(`Closing bidding for Auction #${this.currentAuctionId}...`);
      await API.closeBidding(this.currentAuctionId);
      this._updateLifecycle(2);
      UI.log(`Bidding closed for Auction #${this.currentAuctionId}. No new bids accepted.`);
      UI.toast('Bidding closed!', 'success');
    } catch (err) {
      UI.toast(`Close failed: ${err.message}`, 'error');
    }
  },

  // ─── AI Filter → Set Shortlist ───────────────────────────

  async filterAuction() {
    if (!this.currentAuctionId) {
      UI.toast('Load an auction first.', 'info');
      return;
    }
    try {
      UI.log(`Running two-stage filter for Auction #${this.currentAuctionId}...`);
      const result = await API.filterAuction(this.currentAuctionId);
      this._updateLifecycle(3);
      UI.log(`Shortlist set. ${result.finalists.length} finalists selected.`);
      UI.toast(`${result.finalists.length} bidders shortlisted.`, 'success');
    } catch (err) {
      UI.toast(`Filter failed: ${err.message}`, 'error');
    }
  },

  // ─── Evaluate Finalists ──────────────────────────────────

  async evaluateAuction() {
    if (!this.currentAuctionId) {
      UI.toast('Load an auction first.', 'info');
      return;
    }
    try {
      UI.log(`Evaluating finalists for Auction #${this.currentAuctionId}...`);
      const result = await API.evaluateAuction(this.currentAuctionId);
      this._evalResult = result;
      this._updateLifecycle(4);
      UI.log(`Evaluation complete. Winner: ${result.winner.address.slice(0, 10)}... (score ${result.winner.score.toFixed(3)})`);
      UI.toast(`Winner: ${result.winner.address.slice(0, 10)}...`, 'success');
    } catch (err) {
      UI.toast(`Evaluate failed: ${err.message}`, 'error');
    }
  },

  // ─── Resolve & Mint NFT ──────────────────────────────────

  async resolveAuction() {
    if (!this.currentAuctionId) {
      UI.toast('Load an auction first.', 'info');
      return;
    }
    if (!this._evalResult?.winner) {
      UI.toast('Run evaluation first.', 'error');
      return;
    }

    const ew = this._evalResult.winner;
    const winnerAddr = ew.address;
    const winningScore = ew.winningScore;

    try {
      UI.log(`Resolving Auction #${this.currentAuctionId}. Winner: ${winnerAddr.slice(0, 10)}...`);
      await API.resolveAuction(this.currentAuctionId, winnerAddr, winningScore);
      this._updateLifecycle(5);
      UI.log(`Auction #${this.currentAuctionId} resolved! NFT minted to winner.`);
      UI.toast('Auction resolved! Token minted!', 'success');

      UI.setText('auction-winner-display', `${winnerAddr.slice(0, 10)}...`);
      const winSection = document.getElementById('auction-winner-section');
      if (winSection) winSection.style.display = '';
      await this.refreshAuction();

      if (typeof MarketFlow !== 'undefined' && MarketFlow.refreshTokens) {
        MarketFlow.refreshTokens();
      }
    } catch (err) {
      UI.toast(`Resolve failed: ${err.message}`, 'error');
    }
  },

  // ─── Lifecycle UI ────────────────────────────────────────

  _updateLifecycle(stepIndex) {
    const steps = document.querySelectorAll('#tab-auction .lifecycle-step');
    steps.forEach((step, i) => {
      step.classList.remove('active', 'complete');
      if (i <= stepIndex) {
        step.classList.add(i === stepIndex ? 'active' : 'complete');
      }
    });

    const labels = ['created', 'bidding', 'closed', 'shortlisted', 'evaluated', 'completed'];
    UI.log(`Auction lifecycle: ${labels[stepIndex] || 'unknown'}`);
  },

  // ─── Operator Auction List (Manage Auctions) ─────────────

  _opAuctions: [],
  _opPage: 1,
  _opPageSize: 7,

  async loadOperatorAuctions() {
    const container = document.getElementById('auc-create-list-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-state">Loading auctions...</div>';

    try {
      const result = await API.listAuctions();
      this._opAuctions = result.auctions || [];
      this._opPage = 1;

      if (this._opAuctions.length === 0) {
        container.innerHTML = '<div class="auc-list-empty">No auctions found. Create one above.</div>';
        this._renderOperatorPagination();
        return;
      }

      this._renderOperatorPage();
      this._renderOperatorPagination();
    } catch (err) {
      container.innerHTML = `<span style="color:var(--terminal-red);">Error: ${err.message}</span>`;
    }
  },

  _renderOperatorPage() {
    const container = document.getElementById('auc-create-list-container');
    if (!container) return;
    container.innerHTML = '';

    const start = (this._opPage - 1) * this._opPageSize;
    const end = Math.min(start + this._opPageSize, this._opAuctions.length);
    const pageItems = this._opAuctions.slice(start, end);

    pageItems.forEach(auction => this._renderOperatorAuctionCard(auction, container));
  },

  _renderOperatorPagination() {
    const pg = document.getElementById('auc-create-list-pagination');
    if (!pg) return;

    const totalPages = Math.max(1, Math.ceil(this._opAuctions.length / this._opPageSize));
    if (totalPages <= 1) { pg.style.display = 'none'; pg.innerHTML = ''; return; }
    pg.style.display = '';

    let html = `<span class="pagination-info">${this._opAuctions.length} auctions &bull; page ${this._opPage}/${totalPages}</span>`;
    html += '<div class="pagination-buttons">';

    html += `<button class="pg-btn" ${this._opPage <= 1 ? 'disabled' : ''} onclick="AuctionCreate._goToOperatorPage(${this._opPage - 1})">&#8592; PREV</button>`;

    for (let i = 1; i <= totalPages; i++) {
      if (i === this._opPage) {
        html += `<button class="pg-btn pg-current">${i}</button>`;
      } else if (i === 1 || i === totalPages || Math.abs(i - this._opPage) <= 1) {
        html += `<button class="pg-btn" onclick="AuctionCreate._goToOperatorPage(${i})">${i}</button>`;
      } else if (i === 2 && this._opPage > 3) {
        html += '<span class="pg-ellipsis">...</span>';
      } else if (i === totalPages - 1 && this._opPage < totalPages - 2) {
        html += '<span class="pg-ellipsis">...</span>';
      }
    }

    html += `<button class="pg-btn" ${this._opPage >= totalPages ? 'disabled' : ''} onclick="AuctionCreate._goToOperatorPage(${this._opPage + 1})">NEXT &#8594;</button>`;
    html += '</div>';
    pg.innerHTML = html;
  },

  _goToOperatorPage(page) {
    const totalPages = Math.ceil(this._opAuctions.length / this._opPageSize);
    if (page < 1 || page > totalPages) return;
    this._opPage = page;
    this._renderOperatorPage();
    this._renderOperatorPagination();
  },

  _renderOperatorAuctionCard(auction, container) {
    const card = document.createElement('div');
    card.className = 'auc-list-card';

    let stateClass = 'auc-closed';
    let stateLabel = auction.state;
    let statusClass = 'auc-status-closed';

    if (auction.isActive) {
      stateClass = 'auc-active';
      stateLabel = 'ACTIVE';
      statusClass = 'auc-status-active';
    } else if (auction.isComplete) {
      stateClass = 'auc-completed';
      stateLabel = 'COMPLETED';
      statusClass = 'auc-status-completed';
    }

    card.classList.add(stateClass);

    const biddersLabel = auction.bidderCount === 1 ? 'bidder' : 'bidders';
    const question = auction.question || '';
    const questionDisplay = question
      ? question
      : '<span style="color:#9ca3af;font-style:italic;">Questions proposed by bidders</span>';
    const deadline = auction.biddingEndTime ? `Block: ${auction.biddingEndTime}` : '---';

    card.innerHTML = `
      <div class="auc-list-card-header">
        <span class="auc-list-card-id">Auction #${auction.auctionId}</span>
        <span class="auc-list-card-status ${statusClass}">${stateLabel}</span>
      </div>
      <div class="auc-list-card-question">${questionDisplay}</div>
      <div class="auc-list-card-meta">
        <span class="auc-list-card-stake">${auction.minimumStake} ARC min</span>
        <span class="auc-list-card-bidders">${auction.bidderCount} ${biddersLabel}</span>
        <span>${deadline}</span>
      </div>
    `;

    // Click loads this auction into the operator lifecycle panel
    card.addEventListener('click', () => {
      this.currentAuctionId = auction.auctionId;
      this.refreshAuction();
    });

    container.appendChild(card);
  }
};


// ═══════════════════════════════════════════════════════════
//  AuctionList — PUBLIC: Browse auctions & place bids
// ═══════════════════════════════════════════════════════════

const AuctionList = {
  _allAuctions: [],
  _selectedAuctionId: null,
  _page: 1,
  _pageSize: 7,

  init() {
    // Wallet connect
    const connectBtn = document.getElementById('btn-auc-list-connect');
    if (connectBtn) connectBtn.addEventListener('click', () => this.connectWallet());

    // Refresh list
    const refreshBtn = document.getElementById('btn-auc-list-refresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadAuctions());

    // Back to list from detail
    const backBtn = document.getElementById('btn-auc-list-back');
    if (backBtn) backBtn.addEventListener('click', () => this.showListView());

    // Place bid
    const bidBtn = document.getElementById('btn-auc-list-place-bid');
    if (bidBtn) bidBtn.addEventListener('click', () => this.placeBid());

    // Withdraw stake
    const withdrawBtn = document.getElementById('btn-auc-list-withdraw');
    if (withdrawBtn) withdrawBtn.addEventListener('click', () => this.withdrawStake());
  },

  // ─── Wallet ──────────────────────────────────────────────

  async connectWallet() {
    try {
      const { address, chainId } = await Web3Client.connect();
      this._renderWalletState();
      UI.log(`Auction list wallet connected: ${Web3Client.shortAddress()} on ${Web3Client.networkName()}`);
      UI.toast('Wallet connected!', 'success');
      if (typeof MarketFlow !== 'undefined' && MarketFlow.refreshTokens) {
        MarketFlow.refreshTokens();
      }
    } catch (err) {
      UI.log(`Wallet connection failed: ${err.message}`);
      UI.toast(err.message, 'error');
    }
  },

  _renderWalletState() {
    const container = document.getElementById('auc-list-wallet-state');
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
        <button class="btn btn-sm btn-secondary" style="width:100%;" onclick="AuctionList.disconnectWallet()">DISCONNECT</button>
      `;
    } else {
      container.innerHTML = `
        <div class="web3-status-row">
          <span style="color:var(--terminal-red)">NOT CONNECTED</span>
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

  // ─── Load Auction List ───────────────────────────────────

  async loadAuctions() {
    const container = document.getElementById('auc-list-container');
    if (!container) return;

    container.innerHTML = '<div class="empty-state">Loading auctions...</div>';

    try {
      const result = await API.listAuctions();
      this._allAuctions = result.auctions || [];
      this._page = 1;

      if (this._allAuctions.length === 0) {
        container.innerHTML = '<div class="auc-list-empty">No auctions found. Operators can create new auctions in the Create tab.</div>';
        this._renderPagination();
        return;
      }

      this._renderPage();
      this._renderPagination();

      UI.log(`Loaded ${this._allAuctions.length} auctions.`);
    } catch (err) {
      container.innerHTML = `<span style="color:var(--terminal-red);">Error: ${err.message}</span>`;
      UI.log(`Failed to load auctions: ${err.message}`);
    }
  },

  _renderPage() {
    const container = document.getElementById('auc-list-container');
    if (!container) return;
    container.innerHTML = '';

    const start = (this._page - 1) * this._pageSize;
    const end = Math.min(start + this._pageSize, this._allAuctions.length);
    const pageItems = this._allAuctions.slice(start, end);

    pageItems.forEach(auction => this._renderAuctionCard(auction, container));
  },

  _renderPagination() {
    let pg = document.getElementById('auc-list-pagination');
    if (!pg) {
      pg = document.createElement('div');
      pg.id = 'auc-list-pagination';
      pg.className = 'auc-pagination';
      const container = document.getElementById('auc-list-container');
      if (container) container.insertAdjacentElement('afterend', pg);
    }

    const totalPages = Math.max(1, Math.ceil(this._allAuctions.length / this._pageSize));
    if (totalPages <= 1) { pg.innerHTML = ''; return; }

    let html = `<span class="pagination-info">${this._allAuctions.length} auctions &bull; page ${this._page}/${totalPages}</span>`;
    html += '<div class="pagination-buttons">';

    html += `<button class="pg-btn" ${this._page <= 1 ? 'disabled' : ''} onclick="AuctionList._goToPage(${this._page - 1})">&#8592; PREV</button>`;

    let addedLeftEllipsis = false;
    let addedRightEllipsis = false;

    for (let i = 1; i <= totalPages; i++) {
      if (i === this._page) {
        html += `<button class="pg-btn pg-current">${i}</button>`;
      } else if (i === 1 || i === totalPages || Math.abs(i - this._page) <= 1 || (i <= 2 && this._page <= 3) || (i >= totalPages - 1 && this._page >= totalPages - 2)) {
        html += `<button class="pg-btn" onclick="AuctionList._goToPage(${i})">${i}</button>`;
      } else if (i < this._page && !addedLeftEllipsis) {
        html += '<span class="pg-ellipsis">...</span>';
        addedLeftEllipsis = true;
      } else if (i > this._page && !addedRightEllipsis) {
        html += '<span class="pg-ellipsis">...</span>';
        addedRightEllipsis = true;
      }
    }

    html += `<button class="pg-btn" ${this._page >= totalPages ? 'disabled' : ''} onclick="AuctionList._goToPage(${this._page + 1})">NEXT &#8594;</button>`;
    html += '</div>';
    pg.innerHTML = html;
  },

  _goToPage(page) {
    const totalPages = Math.ceil(this._allAuctions.length / this._pageSize);
    if (page < 1 || page > totalPages) return;
    this._page = page;
    this._renderPage();
    this._renderPagination();
    // Scroll to top of container
    const container = document.getElementById('auc-list-container');
    if (container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _renderAuctionCard(auction, container) {
    const card = document.createElement('div');
    card.className = 'auc-list-card';

    // State styling
    let stateClass = 'auc-closed';
    let stateLabel = auction.state;
    let statusClass = 'auc-status-closed';

    if (auction.isActive) {
      stateClass = 'auc-active';
      stateLabel = 'ACTIVE';
      statusClass = 'auc-status-active';
    } else if (auction.isComplete) {
      stateClass = 'auc-completed';
      stateLabel = 'COMPLETED';
      statusClass = 'auc-status-completed';
    }

    card.classList.add(stateClass);

    const biddersLabel = auction.bidderCount === 1 ? 'bidder' : 'bidders';
    const question = auction.question || '';
    const questionDisplay = question
      ? question
      : '<span style="color:#9ca3af;font-style:italic;">Questions proposed by bidders</span>';
    const deadline = auction.biddingEndTime ? `Block: ${auction.biddingEndTime}` : '---';

    card.innerHTML = `
      <div class="auc-list-card-header">
        <span class="auc-list-card-id">Auction #${auction.auctionId}</span>
        <span class="auc-list-card-status ${statusClass}">${stateLabel}</span>
      </div>
      <div class="auc-list-card-question">${questionDisplay}</div>
      <div class="auc-list-card-meta">
        <span class="auc-list-card-stake">${auction.minimumStake} ARC min</span>
        <span class="auc-list-card-bidders">${auction.bidderCount} ${biddersLabel}</span>
        <span>${deadline}</span>
      </div>
    `;

    card.addEventListener('click', () => this.showAuctionDetail(auction.auctionId));
    container.appendChild(card);
  },

  // ─── Auction Detail View ─────────────────────────────────

  async showAuctionDetail(auctionId) {
    this._selectedAuctionId = auctionId;

    // Hide list, show detail
    const detail = document.getElementById('auc-list-detail');
    if (detail) detail.style.display = '';

    // Hide bid panel until we know the state
    const bidPanel = document.getElementById('auc-list-bid-panel');
    if (bidPanel) bidPanel.style.display = 'none';

    try {
      const auction = await API.getAuction(auctionId);

      UI.setText('auc-list-auction-id', `#${auction.auctionId}`);

      // Time remaining
      const deadline = parseInt(auction.biddingEndTime);
      const now = Math.floor(Date.now() / 1000);
      const remaining = deadline - now;
      if (remaining > 0) {
        const h = Math.floor(remaining / 3600);
        const m = Math.floor((remaining % 3600) / 60);
        UI.setText('auc-list-time-remaining', `${h}h ${m}m`);
      } else {
        UI.setText('auc-list-time-remaining', 'Ended');
      }

      UI.setText('auc-list-min-stake', `${auction.minimumStake || '---'} ARC`);
      UI.setText('auc-list-bidder-count', `${(auction.bidders || []).length}`);

      // Show bid panel only if BIDDING_OPEN
      if (auction.state === 'BIDDING_OPEN' && bidPanel) {
        bidPanel.style.display = '';
      }

      // Load bidders into the dedicated section
      await this._loadBidders(auction);

      UI.log(`Showing detail for Auction #${auctionId}. State: ${auction.state}`);
    } catch (err) {
      UI.toast(`Failed: ${err.message}`, 'error');
    }
  },

  showListView() {
    this._selectedAuctionId = null;
    const detail = document.getElementById('auc-list-detail');
    if (detail) detail.style.display = 'none';
    this.loadAuctions();
    UI.log('Back to auction list.');
  },

  // ─── Bidders List ────────────────────────────────────────

  async _loadBidders(auction) {
    const section = document.getElementById('auc-list-bidders-section');
    const container = document.getElementById('auc-list-bidders');
    if (!container) return;

    let bidders = auction.bidders || [];

    // Show the bidders section
    if (section) section.style.display = '';

    if (!bidders.length) {
      container.innerHTML = '<div class="empty-state">No bids yet. Be the first!</div>';
      const badge = document.getElementById('auc-list-bidder-count-badge');
      if (badge) badge.textContent = '0';
      return;
    }

    const badge = document.getElementById('auc-list-bidder-count-badge');
    if (badge) badge.textContent = `${bidders.length}`;
    container.innerHTML = '';

    bidders.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'bid-card';

      const shortAddr = b.address ? `${b.address.slice(0, 6)}...${b.address.slice(-4)}` : '---';
      const optionsHTML = (b.options || []).map(o =>
        `<span class="bid-option-tag">${o}</span>`
      ).join('');

      let flags = '';
      if (b.shortlisted) flags += ' <span class="bidder-count-badge" style="background:rgba(16,185,129,0.1);color:var(--terminal-green);border-color:rgba(16,185,129,0.3);">SHORTLISTED</span>';
      if (b.withdrawn) flags += ' <span class="bidder-count-badge">WITHDRAWN</span>';

      card.innerHTML = `
        <div class="bid-card-header">
          <span class="bidder-address">${shortAddr}${flags}</span>
          <span class="bid-stake">${b.stake ? parseFloat(b.stake).toFixed(2) + ' ARC' : '---'}</span>
        </div>
        <div class="bid-question">${b.question || '---'}</div>
        ${b.description ? `<div class="bid-description">${b.description}</div>` : ''}
        ${optionsHTML ? `<div class="bid-options">${optionsHTML}</div>` : ''}
        <div class="bid-meta">
          ${b.resolutionDate ? `<span class="bid-meta-item res-date">RES: ${b.resolutionDate}</span>` : ''}
          <span class="bid-meta-item options-count">${(b.options || []).length} options</span>
        </div>
      `;
      container.appendChild(card);
    });
  },

  // ─── Place Bid (PUBLIC) ──────────────────────────────────

  async placeBid() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'error');
      return;
    }
    if (!Web3Client.auctionManagerAddress) {
      UI.toast('AuctionManager address not loaded. Check backend.', 'error');
      return;
    }
    if (!this._selectedAuctionId) {
      UI.toast('No auction selected.', 'error');
      return;
    }

    const stakeStr = UI.getValue('auc-list-bid-stake');
    const question = UI.getValue('auc-list-bid-question');
    const description = UI.getValue('auc-list-bid-description');
    const optionsRaw = UI.getValue('auc-list-bid-options');
    const resDate = UI.getValue('auc-list-bid-res-date');

    const auctionId = this._selectedAuctionId;
    if (!stakeStr || parseFloat(stakeStr) <= 0) { UI.toast('Enter a valid stake amount.', 'error'); return; }
    if (!question) { UI.toast('Enter your prediction question.', 'error'); return; }
    if (!optionsRaw) { UI.toast('Enter resolution options.', 'error'); return; }

    const options = optionsRaw.split(',').map(o => o.trim()).filter(Boolean);
    if (options.length < 2) { UI.toast('At least 2 resolution options required.', 'error'); return; }

    // Encode proposal as JSON for the contract's proposalHash field
    const proposalHash = JSON.stringify({
      q: question,
      d: description || '',
      o: options,
      r: resDate || ''
    });

    const statusEl = document.getElementById('auc-list-bid-status');
    const btn = document.getElementById('btn-auc-list-place-bid');

    try {
      UI.setDisabled('btn-auc-list-place-bid', true);
      if (btn) btn.textContent = 'PROCESSING...';

      // Native currency — ARC (18 decimals)
      const stakeWei = ethers.parseEther(stakeStr);

      // Place bid with native currency (no USDC approval needed)
      if (statusEl) statusEl.textContent = 'Placing bid on-chain...';
      UI.log(`Placing bid: ${stakeStr} ARC on Auction #${auctionId} with question "${question.substring(0, 50)}..."`);

      const auctionMgr = Web3Client.getAuctionManagerSigner();
      const tx = await auctionMgr.placeBid(auctionId, proposalHash, { value: stakeWei, gasLimit: 300000 });
      UI.toast('Bid submitted. Waiting for confirmation...', 'info');
      if (statusEl) statusEl.textContent = `Tx: ${tx.hash.slice(0, 10)}...`;

      const receipt = await tx.wait();

      UI.log(`Bid confirmed in block ${receipt.blockNumber}! ${stakeStr} ARC staked.`);
      UI.toast(`Bid placed: ${stakeStr} ARC on Auction #${auctionId}!`, 'success');
      if (statusEl) statusEl.textContent = `Confirmed in block ${receipt.blockNumber}`;

      // Refresh detail to show updated bidder count
      await this.showAuctionDetail(auctionId);
    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Bid failed: ${msg}`);
      UI.toast(`Bid failed: ${msg}`, 'error');
      if (statusEl) statusEl.textContent = `Error: ${msg}`;
    } finally {
      UI.setDisabled('btn-auc-list-place-bid', false);
      if (btn) btn.textContent = 'PLACE BID';
    }
  },

  // ─── Withdraw Stake (non-winners) ────────────────────────

  async withdrawStake() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'error');
      return;
    }
    if (!this._selectedAuctionId) {
      UI.toast('No auction selected.', 'error');
      return;
    }

    try {
      UI.log(`Withdrawing stake from Auction #${this._selectedAuctionId}...`);
      const auctionMgr = Web3Client.getAuctionManagerSigner();
      const tx = await auctionMgr.withdrawStake(this._selectedAuctionId);
      UI.toast('Withdraw submitted...', 'info');
      const receipt = await tx.wait();
      UI.log(`Stake withdrawn in block ${receipt.blockNumber}.`);
      UI.toast('Stake withdrawn!', 'success');
      await this.showAuctionDetail(this._selectedAuctionId);
    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Withdraw failed: ${msg}`);
      UI.toast(`Withdraw failed: ${msg}`, 'error');
    }
  }
};


// ═══════════════════════════════════════════════════════════
//  Legacy AuctionFlow compatibility — delegates to the new
//  sub-tab modules for backward compatibility with app.js
// ═══════════════════════════════════════════════════════════

const AuctionFlow = {
  get isOperator() { return AuctionCreate.isOperator; },
  set isOperator(v) { AuctionCreate.isOperator = v; },
  get currentAuctionId() { return AuctionCreate.currentAuctionId; },
  set currentAuctionId(v) { AuctionCreate.currentAuctionId = v; },
  get currentAuction() { return AuctionCreate.currentAuction; },
  set currentAuction(v) { AuctionCreate.currentAuction = v; },

  init() {
    AuctionSubTabs._init();
    AuctionCreate.init();
    AuctionList.init();
  },

  _renderWalletState() { AuctionCreate._renderWalletState(); },
  checkOperator() { return AuctionCreate.checkOperator(); },
  connectWallet() { return AuctionCreate.connectWallet(); },
  disconnectWallet() { AuctionCreate.disconnectWallet(); },
  _updateOperatorPanel() { AuctionCreate._updateOperatorUI(); },
};
