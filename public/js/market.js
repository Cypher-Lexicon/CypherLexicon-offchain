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
            <span class="market-option-pool" id="market-pool-${idx}-${oi}">---</span>
          </div>
        `).join('');
      }

      // Fetch on-chain pool amounts directly from the PredictionMarket contract
      if (Web3Client.connected && Web3Client.usdcAddress) {
        this._refreshPoolAmounts(address, idx);
      }
    } catch (err) {
      console.warn(`Failed to load market ${idx} details:`, err.message);
    }
  },

  /** Fetch option pool amounts from the PredictionMarket contract */
  async _refreshPoolAmounts(marketAddress, idx) {
    try {
      const market = Web3Client.getPredictionMarketProvider(marketAddress);
      const pools = await market.getOptionPoolAmounts();
      const usdc = Web3Client.getUSDCContract();
      const decimals = await usdc.decimals();

      pools.forEach((raw, oi) => {
        const formatted = parseFloat(ethers.formatUnits(raw, decimals)).toFixed(2);
        UI.setText(`market-pool-${idx}-${oi}`, `${formatted} USDC`);
      });
    } catch (err) {
      console.warn(`Failed to fetch pool amounts for market ${idx}:`, err.message);
    }
  },

  /** Show a bet form inline for a market */
  async loadBetForm(address, idx) {
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

      // Fetch USDC balance for display
      let balanceText = '---';
      try {
        const bal = await Web3Client.getUSDCBalance();
        balanceText = `${parseFloat(bal.formatted).toFixed(2)} USDC`;
      } catch (e) { /* ignore */ }

      betRow.innerHTML = `
        <div style="font-size:0.75rem;color:#6b7280;margin-bottom:0.35rem;">
          BALANCE: <span id="usdc-balance-${idx}" style="color:var(--terminal-green);">${balanceText}</span>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <input type="number" id="bet-amount-${idx}" placeholder="Amount (USDC)" min="0.01" step="0.01" value="10" style="width:130px;">
          <input type="number" id="bet-option-${idx}" placeholder="Option #" min="0" value="0" style="width:80px;">
          <button class="btn btn-sm btn-primary" id="btn-place-bet-${idx}">BET</button>
          <button class="btn btn-sm btn-secondary" id="btn-close-betting-${idx}">CLOSE BETTING</button>
          <button class="btn btn-sm btn-danger" id="btn-resolve-market-${idx}">RESOLVE</button>
          <button class="btn btn-sm btn-secondary" id="btn-claim-winnings-${idx}">CLAIM</button>
        </div>
        <div id="bet-status-${idx}" style="font-size:0.7rem;color:var(--terminal-amber);margin-top:0.35rem;"></div>
      `;
      card.appendChild(betRow);

      document.getElementById(`btn-place-bet-${idx}`).addEventListener('click', () => this.placeBet(address, idx));
      document.getElementById(`btn-close-betting-${idx}`).addEventListener('click', () => this.closeMarketBetting(address, idx));
      document.getElementById(`btn-resolve-market-${idx}`).addEventListener('click', () => this.resolveMarket(address, idx));
      document.getElementById(`btn-claim-winnings-${idx}`).addEventListener('click', () => this.claimMarketWinnings(address, idx));
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
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'error');
      return;
    }
    if (!Web3Client.usdcAddress) {
      UI.toast('USDC address not loaded. Check backend connection.', 'error');
      return;
    }

    const amountStr = UI.getValue(`bet-amount-${idx}`);
    const optionStr = UI.getValue(`bet-option-${idx}`);
    const option = parseInt(optionStr);

    if (!amountStr || isNaN(option) || option < 0) {
      UI.toast('Fill in a valid amount and option number.', 'error');
      return;
    }

    const statusEl = document.getElementById(`bet-status-${idx}`);
    const btn = document.getElementById(`btn-place-bet-${idx}`);

    try {
      UI.setDisabled(`btn-place-bet-${idx}`, true);
      if (btn) btn.textContent = '...';

      // Parse USDC amount with correct decimals
      const usdc = Web3Client.getUSDCContract();
      const decimals = await usdc.decimals();
      const amountWei = ethers.parseUnits(amountStr, decimals);

      // ── Step 1: Approve USDC ──────────────────────────────
      if (statusEl) statusEl.textContent = 'Checking USDC allowance...';
      UI.log(`Checking USDC allowance for market ${marketAddress.slice(0, 10)}...`);

      const approvalReceipt = await Web3Client.approveUSDC(marketAddress, amountWei);
      if (approvalReceipt) {
        UI.toast('USDC approved for betting.', 'success');
      }

      // ── Step 2: Place bet on PredictionMarket ──────────────
      if (statusEl) statusEl.textContent = 'Placing bet on-chain...';
      UI.log(`Placing bet: ${amountStr} USDC on option #${option} for market ${marketAddress.slice(0, 10)}...`);

      const market = Web3Client.getPredictionMarketSigner(marketAddress);
      const tx = await market.placeBet(option, amountWei);
      UI.toast('Bet submitted. Waiting for confirmation...', 'info');
      if (statusEl) statusEl.textContent = `Tx submitted: ${tx.hash.slice(0, 10)}... waiting...`;

      const receipt = await tx.wait();

      UI.log(`Bet confirmed in block ${receipt.blockNumber}! ${amountStr} USDC on option #${option}`);
      UI.toast(`Bet of ${amountStr} USDC placed on option #${option}!`, 'success');
      if (statusEl) statusEl.textContent = `Confirmed in block ${receipt.blockNumber}`;

      // Refresh USDC balance display and pool amounts
      try {
        const bal = await Web3Client.getUSDCBalance();
        UI.setText(`usdc-balance-${idx}`, `${parseFloat(bal.formatted).toFixed(2)} USDC`);
      } catch (e) { /* ignore */ }
      await this._refreshPoolAmounts(marketAddress, idx);

    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Bet failed: ${msg}`);
      UI.toast(`Bet failed: ${msg}`, 'error');
      if (statusEl) statusEl.textContent = `Error: ${msg}`;
    } finally {
      UI.setDisabled(`btn-place-bet-${idx}`, false);
      if (btn) btn.textContent = 'BET';
    }
  },

  // ─── Close Betting ────────────────────────────────────────

  async closeMarketBetting(marketAddress, idx) {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'error');
      return;
    }

    try {
      UI.log(`Closing betting for market ${marketAddress.slice(0, 10)}...`);
      const market = Web3Client.getPredictionMarketSigner(marketAddress);
      const tx = await market.closeBetting();
      UI.toast('Closing betting... waiting for confirmation...', 'info');
      const receipt = await tx.wait();

      UI.log(`Betting closed in block ${receipt.blockNumber}.`);
      UI.toast('Betting closed!', 'success');

      await this.loadMarkets();
    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Close betting failed: ${msg}`);
      UI.toast(`Failed: ${msg}`, 'error');
    }
  },

  // ─── Claim Winnings ───────────────────────────────────────

  /**
   * Claim winnings from a resolved market.
   * Calls PredictionMarket.claimWinnings() which auto-transfers USDC to msg.sender.
   * claimPublisherFees() is only callable by the PublishingRightsNFT contract —
   * regular users must use claimWinnings().
   */
  async claimMarketWinnings(marketAddress, idx) {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'error');
      return;
    }

    const statusEl = document.getElementById(`bet-status-${idx}`);
    const btn = document.getElementById(`btn-claim-winnings-${idx}`);

    try {
      // ── Step 1: Check claimable amount (read-only) ────────
      const marketRO = Web3Client.getPredictionMarketProvider(marketAddress);

      // Also check market state first
      const details = await marketRO.getMarketDetails();
      const state = ['INACTIVE', 'BETTING_OPEN', 'BETTING_CLOSED', 'RESOLVED'][details[5]];
      if (state !== 'RESOLVED') {
        UI.toast('Market not yet resolved.', 'info');
        UI.log(`Cannot claim — market state is ${state}.`);
        return;
      }

      const claimableRaw = await marketRO.getClaimableWinnings(Web3Client.walletAddress);
      const usdc = Web3Client.getUSDCContract();
      const decimals = await usdc.decimals();
      const claimable = ethers.formatUnits(claimableRaw, decimals);

      if (parseFloat(claimable) <= 0) {
        UI.toast('No winnings to claim. You may not have bet on the winning option, or already claimed.', 'info');
        UI.log(`No claimable winnings — either no winning bet or already claimed.`);
        return;
      }

      // ── Step 2: Call claimWinnings() on-chain ─────────────
      UI.log(`Claimable: ${claimable} USDC. Calling claimWinnings()...`);
      UI.toast(`Claiming ${parseFloat(claimable).toFixed(2)} USDC...`, 'info');
      if (statusEl) statusEl.textContent = 'Claiming winnings...';
      UI.setDisabled(`btn-claim-winnings-${idx}`, true);
      if (btn) btn.textContent = '...';

      const market = Web3Client.getPredictionMarketSigner(marketAddress);
      const tx = await market.claimWinnings();
      UI.toast('Claim submitted. Waiting for confirmation...', 'info');
      if (statusEl) statusEl.textContent = `Tx: ${tx.hash.slice(0, 10)}...`;

      const receipt = await tx.wait();

      UI.log(`Winnings claimed in block ${receipt.blockNumber}! ${claimable} USDC received.`);
      UI.toast(`Claimed ${parseFloat(claimable).toFixed(2)} USDC!`, 'success');
      if (statusEl) statusEl.textContent = `Claimed ${parseFloat(claimable).toFixed(2)} USDC`;

      // Refresh USDC balance
      try {
        const bal = await Web3Client.getUSDCBalance();
        UI.setText(`usdc-balance-${idx}`, `${parseFloat(bal.formatted).toFixed(2)} USDC`);
      } catch (e) { /* ignore */ }

    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Claim failed: ${msg}`);
      UI.toast(`Claim failed: ${msg}`, 'error');
      if (statusEl) statusEl.textContent = `Error: ${msg}`;
    } finally {
      UI.setDisabled(`btn-claim-winnings-${idx}`, false);
      if (btn) btn.textContent = 'CLAIM';
    }
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
