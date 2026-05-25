/**
 * app.js — Cypher Lexicon Main Application Entry
 *
 * Initializes all modules, sets up tab navigation, event bindings,
 * and renders the initial UI state.
 */

const App = {

  async init() {
    // ─── Clock ────────────────────────────────────────────────
    UI.startClock('utc-clock');
    UI.log('System Ready. Select feed item and initiate auction to simulate translator matches.');

    // ─── Agent Arena ──────────────────────────────────────────
    AgentArena.initCards();
    Leaderboard.load();

    // ─── Tab Navigation ───────────────────────────────────────
    this._initTabs();

    // ─── News Selector Events ─────────────────────────────────
    const newsSelect = document.getElementById('news-select');
    if (newsSelect) {
      newsSelect.addEventListener('change', (e) => {
        AgentArena.updateNewsDisplay(e.target.value);
      });
    }

    // ─── Run Auction Button ───────────────────────────────────
    const runBtn = document.getElementById('run-auction');
    if (runBtn) {
      runBtn.addEventListener('click', () => AgentArena.runAuction());
      runBtn.disabled = true;
    }

    // ─── Leaderboard Reset ────────────────────────────────────
    const resetBtn = document.getElementById('btn-reset-stats');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Confirm reset of all persistent agent simulator stats?')) {
          Leaderboard.reset();
        }
      });
    }

    // ─── Web3 Status Check ────────────────────────────────────
    this._checkWeb3Status();

    // ─── Initialize sub-modules ───────────────────────────────
    AuctionFlow.init();
    MarketFlow.init();

    // ─── Wallet change callback ───────────────────────────────
    onWalletChanged = () => {
      AuctionFlow._renderWalletState();
      MarketFlow._renderMarketWalletState();
      UI.log(`Wallet changed: ${Web3Client.shortAddress() || 'disconnected'}`);
    };

    // ─── Load News (triggers the translation arena) ───────────
    await AgentArena.loadNews();

    UI.log('All modules initialized. System online.');
  },

  // ─── Tab Navigation ─────────────────────────────────────────

  _initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        UI.switchTab(tab);

        // When switching to auction tab, refresh wallet state
        if (tab === 'auction') {
          AuctionFlow._renderWalletState();
        }

        // When switching to markets tab, refresh market state
        if (tab === 'markets') {
          MarketFlow._renderMarketWalletState();
          MarketFlow.loadMarkets();
        }

        UI.log(`Switched to ${tab} panel.`);
      });
    });
  },

  // ─── Web3 Status ────────────────────────────────────────────

  async _checkWeb3Status() {
    try {
      const status = await API.getWeb3Status();

      // Cache the USDC address for direct contract interactions
      if (status.usdc_address) {
        Web3Client.usdcAddress = status.usdc_address;
      }

      if (status.oracle_ready || status.backend_ready) {
        UI.log(`Web3 backend: oracle=${status.oracle_ready ? 'ONLINE' : 'OFFLINE'}, backend=${status.backend_ready ? 'ONLINE' : 'OFFLINE'}`);

        // Check if browser has a wallet
        if (Web3Client.isAvailable()) {
          UI.log('Browser wallet detected. Connect to enable on-chain features.');
        }
      }
    } catch (err) {
      console.log('Web3 status check skipped (backend may not be fully configured):', err.message);
    }
  }
};

// ─── Boot ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => App.init());
