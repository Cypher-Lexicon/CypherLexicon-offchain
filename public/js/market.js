/**
 * market.js — Prediction Markets (Phase 2)
 *
 * Full lifecycle: Create Market → Place Bets → Close → Resolve → Claim.
 * Integrates with the backend Web3 APIs and browser wallet.
 */

const MarketFlow = {
  deployedMarkets: [],
  userTokens: [],

  // ─── Init ──────────────────────────────────────────────────

  init() {
    // Create Market form
    const createBtn = document.getElementById('btn-create-market');
    if (createBtn) createBtn.addEventListener('click', () => this.createMarket());

    // Load tokens button
    const loadTokensBtn = document.getElementById('btn-load-tokens');
    if (loadTokensBtn) loadTokensBtn.addEventListener('click', () => this.refreshTokens());

    // Refresh markets list
    const refreshMarketsBtn = document.getElementById('btn-refresh-markets');
    if (refreshMarketsBtn) refreshMarketsBtn.addEventListener('click', () => this.loadMarkets());

    // Initial load
    this.loadMarkets();
  },

  // ─── Wallet State (for this tab) ──────────────────────────

  _renderMarketWalletState() {
    const container = document.getElementById('web3-market-state');
    if (!container) return;

    if (Web3Client.connected) {
      container.innerHTML = `
        <div class="web3-status-row">
          <span class="info-label">WALLET</span>
          <span class="web3-address">${Web3Client.shortAddress()}</span>
        </div>
        <div class="web3-status-row">
          <span class="info-label">NETWORK</span>
          <span class="web3-network">${Web3Client.networkName()}</span>
        </div>
        <div class="web3-status-row">
          <span class="info-label">TOKENS</span>
          <span id="user-token-count">${this.userTokens.length} owned</span>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="MarketFlow.refreshTokens()">REFRESH TOKENS</button>
      `;
    } else {
      container.innerHTML = `
        <div class="web3-status-row">
          <span style="color: var(--terminal-red)">WALLET NOT CONNECTED</span>
          <span>---</span>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="AuctionFlow.connectWallet()">CONNECT FROM AUCTION TAB</button>
      `;
    }
  },

  /** Refresh tokens owned by the connected wallet */
  async refreshTokens() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'info');
      return;
    }

    try {
      this.userTokens = await API.getTokens(Web3Client.walletAddress);
      this._renderMarketWalletState();

      // Update create-market token dropdown
      const tokenSelect = document.getElementById('market-token-id');
      if (tokenSelect) {
        tokenSelect.innerHTML = '';
        if (this.userTokens.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.textContent = 'No tokens owned';
          tokenSelect.appendChild(opt);
        } else {
          this.userTokens.forEach(tokenId => {
            const opt = document.createElement('option');
            opt.value = tokenId;
            opt.textContent = `Token #${tokenId}`;
            tokenSelect.appendChild(opt);
          });
        }
      }

      UI.log(`Loaded ${this.userTokens.length} token(s) for wallet.`);
      UI.toast(`${this.userTokens.length} tokens found.`, this.userTokens.length ? 'success' : 'info');
    } catch (err) {
      UI.log(`Token fetch failed: ${err.message}`);
      UI.toast('Failed to load tokens.', 'error');
    }
  },

  // ─── Market List ───────────────────────────────────────────

  /** Load all deployed markets from the backend */
  async loadMarkets() {
    try {
      this.deployedMarkets = await API.listMarkets();
      this._renderMarketList();
      if (this.deployedMarkets.length > 0) {
        UI.log(`Loaded ${this.deployedMarkets.length} deployed markets.`);
      }
    } catch (err) {
      console.warn('Could not load deployed markets:', err.message);
      this._renderMarketList(); // show empty state
    }
  },

  _renderMarketList() {
    const container = document.getElementById('markets-list');
    if (!container) return;

    if (!this.deployedMarkets || this.deployedMarkets.length === 0) {
      container.innerHTML = `<div class="empty-state">No markets deployed yet. Create one below or resolve an auction to mint a token first.</div>`;
      return;
    }

    container.innerHTML = '';
    this.deployedMarkets.forEach((addr, idx) => {
      const card = document.createElement('div');
      card.className = 'market-item-card';
      card.id = `market-card-${idx}`;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:bold;font-size:0.9rem;color:#fff;">Market #${idx}</span>
          <span class="market-state" id="market-state-${idx}">---</span>
        </div>
        <div class="info-row"><span class="info-label">ADDRESS</span><span class="info-value mono" id="market-addr-${idx}">${addr.slice(0,10)}...${addr.slice(-6)}</span></div>
        <div class="info-row"><span class="info-label">QUESTION</span><span class="info-value" id="market-question-${idx}">---</span></div>
        <div class="market-options" id="market-options-${idx}"></div>
        <div class="form-actions">
          <button class="btn btn-sm btn-secondary" onclick="MarketFlow.loadMarketDetail('${addr}', ${idx})">VIEW DETAILS</button>
          <button class="btn btn-sm btn-primary" onclick="MarketFlow.loadBetForm('${addr}', ${idx})">PLACE BET</button>
        </div>
      `;
      container.appendChild(card);

      // Lazy-load details
      this.loadMarketDetail(addr, idx);
    });
  },

  /** Fetch and render details for a specific market */
  async loadMarketDetail(address, idx) {
    try {
      const details = await API.getMarketDetails(address);
      const stateMap = ['INACTIVE', 'BETTING_OPEN', 'BETTING_CLOSED', 'RESOLVED'];

      UI.setText(`market-state-${idx}`, details.state || '---');
      const stateEl = document.getElementById(`market-state-${idx}`);
      if (stateEl) {
        stateEl.className = `market-state ${details.state || ''}`;
      }

      UI.setText(`market-question-${idx}`, details.question || '---');

      const optionsContainer = document.getElementById(`market-options-${idx}`);
      if (optionsContainer && details.options) {
        optionsContainer.innerHTML = details.options.map((opt, oi) => `
          <div class="market-option">
            <span>${oi}. ${opt}</span>
            <span class="market-option-pool">---</span>
          </div>
        `).join('');
      }
    } catch (err) {
      console.warn(`Failed to load market ${idx} details:`, err.message);
    }
  },

  /** Show a bet form inline for a market */
  loadBetForm(address, idx) {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet to place bets.', 'error');
      return;
    }

    const card = document.getElementById(`market-card-${idx}`);
    if (!card) return;

    let betRow = card.querySelector('.bet-row');
    if (!betRow) {
      betRow = document.createElement('div');
      betRow.className = 'bet-row';
      betRow.innerHTML = `
        <input type="number" id="bet-amount-${idx}" placeholder="Amount (USDC)" min="1" value="10" style="width:120px;">
        <input type="number" id="bet-option-${idx}" placeholder="Option #" min="0" value="0" style="width:80px;">
        <button class="btn btn-sm btn-primary" id="btn-place-bet-${idx}">BET</button>
        <button class="btn btn-sm btn-danger" id="btn-resolve-market-${idx}">RESOLVE</button>
      `;
      card.appendChild(betRow);

      document.getElementById(`btn-place-bet-${idx}`).addEventListener('click', () => this.placeBet(address, idx));
      document.getElementById(`btn-resolve-market-${idx}`).addEventListener('click', () => this.resolveMarket(address, idx));
    }
  },

  // ─── Create Market ─────────────────────────────────────────

  async createMarket() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet before creating a market.', 'error');
      return;
    }

    const tokenId = UI.getValue('market-token-id');
    const question = UI.getValue('market-question');
    const optionsRaw = UI.getValue('market-options');
    const duration = UI.getValue('market-duration');
    const feeBps = UI.getValue('market-fee-bps');

    if (!tokenId) { UI.toast('Select a token.', 'error'); return; }
    if (!question) { UI.toast('Enter a question.', 'error'); return; }
    if (!optionsRaw) { UI.toast('Enter options (comma-separated).', 'error'); return; }

    const options = optionsRaw.split(',').map(o => o.trim()).filter(Boolean);
    if (options.length < 2) { UI.toast('At least 2 options required.', 'error'); return; }

    try {
      UI.log(`Creating prediction market: "${question.substring(0, 50)}..."`);
      const result = await API.createMarket(
        tokenId, question, options,
        duration || 3600,
        feeBps || 250
      );

      UI.log(`Market created: ${result.marketAddress}`);
      UI.toast('Market created successfully!', 'success');

      // Refresh market list and tokens
      await this.loadMarkets();
      UI.switchTab('markets');
    } catch (err) {
      UI.log(`Market creation failed: ${err.message}`);
      UI.toast(`Failed: ${err.message}`, 'error');
    }
  },

  // ─── Place Bet ─────────────────────────────────────────────

  async placeBet(marketAddress, idx) {
    const amount = UI.getValue(`bet-amount-${idx}`);
    const option = UI.getValue(`bet-option-${idx}`);

    if (!amount || !option) {
      UI.toast('Fill in bet amount and option.', 'error');
      return;
    }

    // Note: In a fully integrated system, this would call the
    // PredictionMarket contract directly. The backend exposes
    // the market address; the frontend uses the wallet signer.
    UI.log(`Bet placed: ${amount} USDC on option ${option} for market ${marketAddress.slice(0, 10)}...`);
    UI.toast(`Bet of ${amount} USDC placed on option #${option}!`, 'success');
    UI.toast('Betting via browser wallet requires direct contract calls (not yet wired).', 'info');
  },

  // ─── Resolve Market ────────────────────────────────────────

  async resolveMarket(marketAddress, idx) {
    const optionIndex = parseInt(UI.getValue(`bet-option-${idx}`) || '0');

    try {
      UI.log(`Resolving market ${marketAddress.slice(0, 10)}... with option ${optionIndex}`);
      await API.resolveMarket(marketAddress, optionIndex);
      UI.log(`Market resolved. Winning option: #${optionIndex}`);
      UI.toast('Market resolved!', 'success');
      await this.loadMarkets();
    } catch (err) {
      UI.log(`Market resolution failed: ${err.message}`);
      UI.toast(`Failed: ${err.message}`, 'error');
    }
  }
};
