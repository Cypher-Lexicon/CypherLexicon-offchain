/**
 * leaderboard.js — Persistent Leaderboard
 *
 * Tracks agent wins, points, and USDC earnings in localStorage.
 */

const Leaderboard = {
  stats: {
    CN_Macro: { wins: 0, points: 0, usdc: 0 },
    Generic_AI: { wins: 0, points: 0, usdc: 0 },
    Asia_Expert: { wins: 0, points: 0, usdc: 0 }
  },

  // ─── Load / Save ───────────────────────────────────────────

  load() {
    const stored = localStorage.getItem('cypher_lexicon_leaderboard');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle schema changes
        this.stats = { ...this.stats, ...parsed };
      } catch (e) {
        console.error('Failed to parse leaderboard', e);
      }
    }
    this.render();
  },

  save() {
    localStorage.setItem('cypher_lexicon_leaderboard', JSON.stringify(this.stats));
  },

  // ─── Render ────────────────────────────────────────────────

  render() {
    const tbody = document.getElementById('leaderboard-body');
    if (!tbody) return;

    const sorted = Object.entries(this.stats)
      .map(([name, s]) => ({ name, ...s }))
      .sort((a, b) => b.points - a.points);

    if (sorted.every(s => s.points === 0)) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-state">No auctions run yet. Start a translation race!</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    sorted.forEach((agent, index) => {
      const row = document.createElement('tr');
      row.className = `leaderboard-row-${index}`;
      row.innerHTML = `
        <td class="rank-cell">#0${index + 1}</td>
        <td class="agent-cell">${agent.name}</td>
        <td class="numeric-cell">${agent.wins}</td>
        <td class="numeric-cell" style="font-weight: bold;">${agent.points}</td>
        <td class="numeric-cell highlight-usdc">$${agent.usdc} USDC</td>
      `;
      tbody.appendChild(row);
    });
  },

  // ─── Update ────────────────────────────────────────────────

  /** Add a win for the given agent */
  updateStats(agentName, pointsGained, usdcEarned) {
    if (!this.stats[agentName]) return;
    this.stats[agentName].wins += 1;
    this.stats[agentName].points += pointsGained;
    this.stats[agentName].usdc += usdcEarned;
    this.save();
    this.render();
  },

  /** Reset all stats to zero */
  reset() {
    this.stats = {
      CN_Macro: { wins: 0, points: 0, usdc: 0 },
      Generic_AI: { wins: 0, points: 0, usdc: 0 },
      Asia_Expert: { wins: 0, points: 0, usdc: 0 }
    };
    this.save();
    this.render();
    UI.log('Leaderboard stats reset to 0 by system administrator.');
    UI.toast('Leaderboard stats reset.', 'info');
  }
};
