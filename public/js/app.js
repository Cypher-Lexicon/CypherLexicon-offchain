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
    UI.log('System Ready. Cypher Lexicon AUCTION + PREDICTION MARKET online.');

    // ─── Tab Navigation ───────────────────────────────────────
    this._initTabs();

    // ─── Web3 Status Check ────────────────────────────────────
    this._checkWeb3Status();

    // ─── Initialize sub-modules ───────────────────────────────
    AuctionFlow.init();
    MarketFlow.init();

    // ─── Wallet change callback ───────────────────────────────
    onWalletChanged = () => {
      AuctionCreate._renderWalletState();
      AuctionCreate.checkOperator();
      AuctionList._renderWalletState();
      MarketFlow._renderMarketWalletState();
      UI.log(`Wallet changed: ${Web3Client.shortAddress() || 'disconnected'}`);
    };

    UI.log('All modules initialized. System online.');
  },

  // ─── Tab Navigation ─────────────────────────────────────────

  _initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        UI.switchTab(tab);

        if (tab === 'auction') {
          AuctionCreate._renderWalletState();
          AuctionCreate.checkOperator();
          AuctionList._renderWalletState();
        }
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
      if (status.auction_manager) { Web3Client.auctionManagerAddress = status.auction_manager; }
      if (status.market_factory) { Web3Client.marketFactoryAddress = status.market_factory; }

      if (status.oracle_ready || status.backend_ready) {
        UI.log(`Web3 backend: oracle=${status.oracle_ready ? 'ONLINE' : 'OFFLINE'}, backend=${status.backend_ready ? 'ONLINE' : 'OFFLINE'}`);
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
