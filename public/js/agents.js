/**
 * agents.js — Agent Card Rendering & Translation Auction Logic
 *
 * Manages the 3-agent translation race (Phase 1 simulation).
 */

const AGENTS_LIST = [
  { id: 0, name: "CN_Macro", specialty: "Chinese Macro & Monetary Policy", rep: 0.85 },
  { id: 1, name: "Generic_AI", specialty: "General Purpose Translation & Markets", rep: 0.60 },
  { id: 2, name: "Asia_Expert", specialty: "Asian Geopolitics & Financial Markets", rep: 0.92 }
];

const AgentArena = {
  newsFeed: [],
  selectedNewsIndex: 0,
  currentAuctionResult: null,  // holds the last auction result for on-chain push

  // ─── Init ──────────────────────────────────────────────────

  /** Build the 3 agent cards in the arena grid */
  initCards() {
    const container = document.getElementById('agent-columns');
    if (!container) return;
    container.innerHTML = '';

    AGENTS_LIST.forEach((agent) => {
      const card = document.createElement('div');
      card.className = 'agent-card';
      card.id = `agent-card-${agent.id}`;
      card.innerHTML = `
        <div class="winner-badge">WINNER</div>
        <div class="agent-header">
          <div class="agent-id">AGENT_0${agent.id} // SECURE_NODE</div>
          <div class="agent-name">${agent.name}</div>
          <div class="agent-spec">${agent.specialty}</div>
        </div>
        <div class="agent-stats">
          <div class="stat-box">
            <span class="stat-label">REPUTATION</span>
            <span class="stat-value">${agent.rep.toFixed(2)}</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">BID VALUE</span>
            <span class="stat-value cyan" id="agent-bid-${agent.id}">---</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">CLAUDE CONF.</span>
            <span class="stat-value" id="agent-conf-${agent.id}">---</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">FINAL SCORE</span>
            <span class="stat-value" id="agent-score-${agent.id}">---</span>
          </div>
        </div>
        <div class="score-telemetry">
          <div class="score-telemetry-header">
            <span>WEIGHTED RESOLUTION SCORE</span>
            <span class="score-telemetry-value" id="agent-telemetry-val-${agent.id}">0.0000</span>
          </div>
          <div class="score-bar-container">
            <div class="score-bar-fill" id="agent-bar-fill-${agent.id}"></div>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  },

  /** Reset all agent cards to their pre-auction state */
  resetCards() {
    for (let id = 0; id < 3; id++) {
      const card = document.getElementById(`agent-card-${id}`);
      if (card) card.classList.remove('winner');

      UI.setText(`agent-bid-${id}`, '---');
      UI.setText(`agent-conf-${id}`, '---');
      UI.setText(`agent-score-${id}`, '---');
      UI.setText(`agent-telemetry-val-${id}`, '0.0000');
      const bar = document.getElementById(`agent-bar-fill-${id}`);
      if (bar) bar.style.width = '0%';
    }
  },

  /** Populate agent cards with auction results */
  renderResults(data) {
    data.agents.forEach((agentResult, idx) => {
      UI.setText(`agent-bid-${idx}`, `$${agentResult.bid}`);
      UI.setText(`agent-conf-${idx}`, `${Math.round(agentResult.response.confidence_score * 100)}%`);
      UI.setText(`agent-score-${idx}`, agentResult.score.toFixed(4));
      UI.setText(`agent-telemetry-val-${idx}`, agentResult.score.toFixed(4));

      const scorePercent = Math.min(Math.max(agentResult.score * 100, 0), 100);
      const bar = document.getElementById(`agent-bar-fill-${idx}`);
      if (bar) bar.style.width = `${scorePercent}%`;
    });

    // Highlight winner
    const winnerIndex = data.winner_index;
    const winnerCard = document.getElementById(`agent-card-${winnerIndex}`);
    if (winnerCard) winnerCard.classList.add('winner');
  },

  // ─── News Feed ─────────────────────────────────────────────

  /** Load news feed from backend and populate the dropdown */
  async loadNews() {
    try {
      this.newsFeed = await API.fetchNews();
      const select = document.getElementById('news-select');
      if (!select) return;

      select.innerHTML = '';
      this.newsFeed.forEach((item, index) => {
        const opt = document.createElement('option');
        opt.value = index;
        opt.textContent = `[${item.lang}] ${item.source} — ${item.hint}`;
        select.appendChild(opt);
      });

      this.updateNewsDisplay(0);

      UI.setDisabled('run-auction', false);
      UI.setAuctionStatus('READY FOR AUCTION');
      UI.log('News feed telemetry initialized successfully.');
    } catch (err) {
      console.error(err);
      UI.setAuctionStatus('OFFLINE — RETRY IN SECONDS', 'var(--terminal-red)');
      UI.log('Error connecting to server telemetry API.');
    }
  },

  /** Update the news display card for a given index */
  updateNewsDisplay(index) {
    this.selectedNewsIndex = parseInt(index);
    const item = this.newsFeed[this.selectedNewsIndex];
    if (!item) return;

    UI.setText('news-source', `SOURCE: ${item.source}`);
    UI.setText('news-lang', item.lang);
    UI.setText('news-original', item.zh);
    UI.setText('news-hint', `Transl. Hint: ${item.hint}`);
  },

  // ─── Run Auction ───────────────────────────────────────────

  /** Trigger a translation auction via the backend */
  async runAuction() {
    const btn = document.getElementById('run-auction');
    UI.setDisabled('run-auction', true);
    UI.setAuctionStatus('AGENTS TRANSLATING...', 'var(--terminal-amber)');
    document.getElementById('auction-status').className = 'auction-status blinking-cursor';
    UI.hide('winning-card-container');

    this.resetCards();
    UI.log(`Initiated auction request for news feed item #${this.selectedNewsIndex}...`);

    try {
      const data = await API.runAuction(this.selectedNewsIndex);
      this.currentAuctionResult = data;

      UI.setAuctionStatus('COMPUTING SCORES...');

      setTimeout(() => {
        this.renderResults(data);

        setTimeout(() => {
          this._renderWinnerCard(data);
          this._updateLeaderboardForWin(data);

          UI.setAuctionStatus('AUCTION RESOLVED', 'var(--terminal-green)');
          UI.setDisabled('run-auction', false);
          UI.log(`Auction finished. Agent [${data.agents[data.winner_index].name}] won with Score: ${data.agents[data.winner_index].score}. Awarded +${data.points_gained} PTS, +$${data.royalty_usdc} USDC royalty.`);

          // Notify the auction tab that we have a winner ready
          if (typeof onAuctionWinnerReady === 'function') {
            onAuctionWinnerReady(data);
          }
        }, 400);
      }, 800);

    } catch (err) {
      console.error('Auction failure:', err);
      UI.setAuctionStatus('AUCTION FAILED', 'var(--terminal-red)');
      document.getElementById('auction-status').className = 'auction-status';
      UI.log(`Critical failure in processing transaction auction: ${err.message}`);
      UI.setDisabled('run-auction', false);
    }
  },

  // ─── Winner Card ───────────────────────────────────────────

  /** Render the winning prediction market card in the dashboard */
  _renderWinnerCard(data) {
    const winner = data.agents[data.winner_index];

    UI.setText('winner-market-title', winner.response.title);
    UI.setText('winner-market-criteria', winner.response.resolution_criteria);

    const tagsContainer = document.getElementById('winner-market-tags');
    if (tagsContainer) {
      tagsContainer.innerHTML = '';
      winner.response.tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'market-tag';
        span.textContent = tag;
        tagsContainer.appendChild(span);
      });
    }

    const confidencePercent = Math.round(winner.response.confidence_score * 100);
    UI.setText('winner-confidence-val', `CONFIDENCE: ${confidencePercent}%`);
    const fill = document.getElementById('winner-confidence-fill');
    if (fill) fill.style.width = `${confidencePercent}%`;

    UI.show('winning-card-container');
  },

  /** Update leaderboard stats via the external leaderboard module */
  _updateLeaderboardForWin(data) {
    if (typeof Leaderboard !== 'undefined' && Leaderboard.updateStats) {
      const winner = data.agents[data.winner_index];
      Leaderboard.updateStats(winner.name, data.points_gained, data.royalty_usdc);
    }
  }
};

// Callback: set by auction.js to pick up winner data for on-chain push
let onAuctionWinnerReady = null;
