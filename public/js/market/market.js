/**
 * market/market.js — PREDICTION MARKET Phase (Phase 2)
 *
 * NFT token holders can create prediction markets with the questions
 * they won from the auction phase. Anyone can bet ARC on outcomes.
 */

const MarketFlow = {
  deployedMarkets: [],
  userTokens: [],

  // ─── Init ──────────────────────────────────────────────────

  init() {
    // Create Market form
    const createBtn = document.getElementById('btn-market-create');
    if (createBtn) createBtn.addEventListener('click', () => this.createMarket());

    // Load tokens button
    const loadTokensBtn = document.getElementById('btn-market-load-tokens');
    if (loadTokensBtn) loadTokensBtn.addEventListener('click', () => this.refreshTokens());

    // Refresh markets list
    const refreshMarketsBtn = document.getElementById('btn-market-refresh');
    if (refreshMarketsBtn) refreshMarketsBtn.addEventListener('click', () => this.loadMarkets());

    // Wallet connect (market tab)
    const walletBtn = document.getElementById('btn-market-connect-wallet');
    if (walletBtn) walletBtn.addEventListener('click', () => this.connectMarketWallet());

    // Initial load
    this.loadMarkets();
    this._renderMarketWalletState();
  },

  // ─── Wallet ────────────────────────────────────────────────

  async connectMarketWallet() {
    try {
      await Web3Client.connect();
      this._renderMarketWalletState();
      UI.log(`Market wallet connected: ${Web3Client.shortAddress()}`);
      this.refreshTokens();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  },

  _renderMarketWalletState() {
    const container = document.getElementById('market-wallet-state');
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
          <span id="market-token-count">${this.userTokens.length} owned</span>
        </div>
        <button class="btn btn-sm btn-secondary" onclick="MarketFlow.refreshTokens()" style="width:100%;margin-top:0.5rem;">REFRESH TOKENS</button>
      `;
    } else {
      container.innerHTML = `
        <div class="web3-status-row">
          <span style="color:var(--terminal-red)">NOT CONNECTED</span>
          <span>---</span>
        </div>
        <button class="btn btn-sm btn-secondary" id="btn-market-connect-wallet" style="width:100%;" onclick="MarketFlow.connectMarketWallet()">CONNECT WALLET</button>
      `;
    }
  },

  async refreshTokens() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet first.', 'info');
      return;
    }
    try {
      this.userTokens = await API.getTokens(Web3Client.walletAddress);
      this._renderMarketWalletState();

      const tokenSelect = document.getElementById('market-create-token');
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

        // Auto-populate from winning bid on token selection
        tokenSelect.onchange = () => {
          const selectedToken = tokenSelect.value;
          if (selectedToken) {
            this._autoPopulateFromToken(parseInt(selectedToken));
          }
        };
      }

      UI.log(`Loaded ${this.userTokens.length} token(s) for wallet.`);
      UI.toast(`${this.userTokens.length} tokens found.`, this.userTokens.length ? 'success' : 'info');
    } catch (err) {
      UI.log(`Token fetch failed: ${err.message}`);
      UI.toast('Failed to load tokens.', 'error');
    }
  },

  /** Auto-populate market creation form from the winning bid's proposal data */
  async _autoPopulateFromToken(tokenId) {
    try {
      const auction = await API.getAuctionByToken(tokenId);
      if (auction.question) {
        UI.setValue('market-create-question', auction.question);
        UI.log(`Auto-filled question from Auction #${auction.auctionId} winner.`);
      }
      if (auction.options && auction.options.length) {
        UI.setValue('market-create-options', auction.options.join(', '));
        UI.log(`Auto-filled ${auction.options.length} options.`);
      }
      // Store the token info for reference
      const hint = document.querySelector('.token-select-hint');
      if (hint && auction.question) {
        hint.textContent = `From Auction #${auction.auctionId} winner: "${auction.question.substring(0, 60)}${auction.question.length > 60 ? '...' : ''}"`;
        hint.style.color = 'var(--terminal-green)';
      }
    } catch (err) {
      console.warn('Could not auto-populate from token:', err.message);
      UI.log(`Note: Could not fetch winning proposal data for token #${tokenId}.`);
    }
  },

  // ─── Market List ───────────────────────────────────────────

  async loadMarkets() {
    try {
      this.deployedMarkets = await API.listMarkets();
      this._renderMarketList();
      if (this.deployedMarkets.length > 0) {
        UI.log(`Loaded ${this.deployedMarkets.length} deployed markets.`);
      }
    } catch (err) {
      console.warn('Could not load deployed markets:', err.message);
      this._renderMarketList();
    }
  },

  _renderMarketList() {
    const container = document.getElementById('markets-list');
    if (!container) return;

    if (!this.deployedMarkets || this.deployedMarkets.length === 0) {
      container.innerHTML = `<div class="empty-state">No markets deployed yet. Win an auction to get a Publishing Rights NFT token, then create a market here.</div>`;
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
      this.loadMarketDetail(addr, idx);
    });
  },

  async loadMarketDetail(address, idx) {
    try {
      const details = await API.getMarketDetails(address);

      UI.setText(`market-state-${idx}`, details.state || '---');
      const stateEl = document.getElementById(`market-state-${idx}`);
      if (stateEl) {
        stateEl.className = `market-state ${details.state || ''}`;
      }

      UI.setText(`market-question-${idx}`, details.question || '---');

      const optsContainer = document.getElementById(`market-options-${idx}`);
      if (optsContainer && details.options) {
        optsContainer.innerHTML = details.options.map((opt, oi) => `
          <div class="market-option">
            <span>${oi}. ${opt}</span>
            <span class="market-option-pool" id="market-pool-${idx}-${oi}">---</span>
          </div>
        `).join('');
      }

      if (Web3Client.connected) {
        this._refreshPoolAmounts(address, idx);
      }
    } catch (err) {
      console.warn(`Failed to load market ${idx} details:`, err.message);
    }
  },

  async _refreshPoolAmounts(marketAddress, idx) {
    try {
      const market = Web3Client.getPredictionMarketProvider(marketAddress);
      const pools = await market.getOptionPoolAmounts();
      pools.forEach((raw, oi) => {
        const formatted = parseFloat(ethers.formatEther(raw)).toFixed(2);
        UI.setText(`market-pool-${idx}-${oi}`, `${formatted} ARC`);
      });
    } catch (err) {
      console.warn(`Failed to fetch pool amounts for market ${idx}:`, err.message);
    }
  },

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

      let balanceText = '---';
      try {
        const raw = await Web3Client.provider.getBalance(Web3Client.walletAddress);
        balanceText = `${parseFloat(ethers.formatEther(raw)).toFixed(4)} ARC`;
      } catch (e) {}

      betRow.innerHTML = `
        <div class="bet-amount-display" style="margin-bottom:0.35rem;">
          BALANCE: <span class="balance" id="market-balance-${idx}">${balanceText}</span>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <input type="number" id="market-bet-amt-${idx}" placeholder="Amount (ARC)" min="0.0001" step="0.0001" value="0.01" style="width:130px;">
          <input type="number" id="market-bet-opt-${idx}" placeholder="Option #" min="0" value="0" style="width:80px;">
          <button class="btn btn-sm btn-primary" id="btn-market-bet-${idx}">BET</button>
          <button class="btn btn-sm btn-secondary" id="btn-market-close-${idx}">CLOSE</button>
          <button class="btn btn-sm btn-danger" id="btn-market-resolve-${idx}">RESOLVE</button>
          <button class="btn btn-sm btn-secondary" id="btn-market-claim-${idx}">CLAIM</button>
        </div>
        <div id="market-bet-status-${idx}" style="font-size:0.7rem;color:var(--terminal-amber);margin-top:0.35rem;"></div>
      `;
      card.appendChild(betRow);

      document.getElementById(`btn-market-bet-${idx}`).addEventListener('click', () => this.placeBet(address, idx));
      document.getElementById(`btn-market-close-${idx}`).addEventListener('click', () => this.closeMarketBetting(address, idx));
      document.getElementById(`btn-market-resolve-${idx}`).addEventListener('click', () => this.resolveMarket(address, idx));
      document.getElementById(`btn-market-claim-${idx}`).addEventListener('click', () => this.claimMarketWinnings(address, idx));
    }
  },

  // ─── Create Market ─────────────────────────────────────────

  async createMarket() {
    if (!Web3Client.connected) {
      UI.toast('Connect wallet before creating a market.', 'error');
      return;
    }

    const tokenId = UI.getValue('market-create-token');
    const question = UI.getValue('market-create-question');
    const optionsRaw = UI.getValue('market-create-options');
    const duration = UI.getValue('market-create-duration');
    const feeBps = UI.getValue('market-create-fee');

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

    const amountStr = UI.getValue(`market-bet-amt-${idx}`);
    const optionStr = UI.getValue(`market-bet-opt-${idx}`);
    const option = parseInt(optionStr);

    if (!amountStr || isNaN(option) || option < 0) {
      UI.toast('Fill in a valid amount and option number.', 'error');
      return;
    }

    const statusEl = document.getElementById(`market-bet-status-${idx}`);
    const btn = document.getElementById(`btn-market-bet-${idx}`);

    try {
      UI.setDisabled(`btn-market-bet-${idx}`, true);
      if (btn) btn.textContent = '...';

      // Native currency — ARC (18 decimals)
      const amountWei = ethers.parseEther(amountStr);

      if (statusEl) statusEl.textContent = 'Placing bet...';
      UI.log(`Placing bet: ${amountStr} ARC on option #${option}`);

      const market = Web3Client.getPredictionMarketSigner(marketAddress);
      const tx = await market.placeBet(option, { value: amountWei, gasLimit: 300000 });
      UI.toast('Bet submitted. Waiting...', 'info');
      if (statusEl) statusEl.textContent = `Tx: ${tx.hash.slice(0, 10)}...`;

      const receipt = await tx.wait();
      UI.log(`Bet confirmed! ${amountStr} ARC on option #${option}`);
      UI.toast(`Bet placed: ${amountStr} ARC!`, 'success');
      if (statusEl) statusEl.textContent = `Confirmed block ${receipt.blockNumber}`;

      try {
        const raw = await Web3Client.provider.getBalance(Web3Client.walletAddress);
        UI.setText(`market-balance-${idx}`, `${parseFloat(ethers.formatEther(raw)).toFixed(4)} ARC`);
      } catch (e) {}
      await this._refreshPoolAmounts(marketAddress, idx);

    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Bet failed: ${msg}`);
      UI.toast(`Bet failed: ${msg}`, 'error');
      if (statusEl) statusEl.textContent = `Error: ${msg}`;
    } finally {
      UI.setDisabled(`btn-market-bet-${idx}`, false);
      if (btn) btn.textContent = 'BET';
    }
  },

  async closeMarketBetting(marketAddress, idx) {
    if (!Web3Client.connected) { UI.toast('Connect wallet first.', 'error'); return; }
    try {
      UI.log(`Closing betting for market ${marketAddress.slice(0, 10)}...`);
      const market = Web3Client.getPredictionMarketSigner(marketAddress);
      const tx = await market.closeBetting();
      await tx.wait();
      UI.log('Betting closed.');
      UI.toast('Betting closed!', 'success');
      await this.loadMarkets();
    } catch (err) {
      UI.toast(`Failed: ${err.message}`, 'error');
    }
  },

  async claimMarketWinnings(marketAddress, idx) {
    if (!Web3Client.connected) { UI.toast('Connect wallet first.', 'error'); return; }

    const statusEl = document.getElementById(`market-bet-status-${idx}`);
    const btn = document.getElementById(`btn-market-claim-${idx}`);

    try {
      const marketRO = Web3Client.getPredictionMarketProvider(marketAddress);
      const details = await marketRO.getMarketDetails();
      const state = ['INACTIVE', 'BETTING_OPEN', 'BETTING_CLOSED', 'RESOLVED'][details[5]];
      if (state !== 'RESOLVED') { UI.toast('Market not yet resolved.', 'info'); return; }

      const claimableRaw = await marketRO.getClaimableWinnings(Web3Client.walletAddress);
      const claimable = ethers.formatEther(claimableRaw);
      if (parseFloat(claimable) <= 0) { UI.toast('No winnings to claim.', 'info'); return; }

      UI.log(`Claiming ${claimable} ARC...`);
      if (statusEl) statusEl.textContent = 'Claiming...';
      UI.setDisabled(`btn-market-claim-${idx}`, true);
      if (btn) btn.textContent = '...';

      const market = Web3Client.getPredictionMarketSigner(marketAddress);
      const tx = await market.claimWinnings();
      const receipt = await tx.wait();

      UI.log(`Claimed ${parseFloat(claimable).toFixed(4)} ARC!`);
      UI.toast(`Claimed ${parseFloat(claimable).toFixed(4)} ARC!`, 'success');
      if (statusEl) statusEl.textContent = `Claimed ${parseFloat(claimable).toFixed(4)} ARC`;

      try {
        const raw = await Web3Client.provider.getBalance(Web3Client.walletAddress);
        UI.setText(`market-balance-${idx}`, `${parseFloat(ethers.formatEther(raw)).toFixed(4)} ARC`);
      } catch (e) {}
    } catch (err) {
      const msg = err.reason || err.message || String(err);
      UI.log(`Claim failed: ${msg}`);
      UI.toast(`Claim failed: ${msg}`, 'error');
      if (statusEl) statusEl.textContent = `Error: ${msg}`;
    } finally {
      UI.setDisabled(`btn-market-claim-${idx}`, false);
      if (btn) btn.textContent = 'CLAIM';
    }
  },

  async resolveMarket(marketAddress, idx) {
    const optionIndex = parseInt(UI.getValue(`market-bet-opt-${idx}`) || '0');
    try {
      UI.log(`Resolving market ${marketAddress.slice(0, 10)}... with option ${optionIndex}`);
      await API.resolveMarket(marketAddress, optionIndex);
      UI.log(`Market resolved. Winning: #${optionIndex}`);
      UI.toast('Market resolved!', 'success');
      await this.loadMarkets();
    } catch (err) {
      UI.log(`Resolution failed: ${err.message}`);
      UI.toast(`Failed: ${err.message}`, 'error');
    }
  }
};
