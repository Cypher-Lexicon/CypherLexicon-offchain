/**
 * ui.js — UI Utilities
 *
 * Clock, log stream, toast notifications, and DOM helpers.
 */

const UI = {

  // ─── Clock ─────────────────────────────────────────────────

  /** Start the UTC clock in the header */
  startClock(elementId) {
    const tick = () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const el = document.getElementById(elementId);
      if (el) {
        el.textContent =
          `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ` +
          `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())} UTC`;
      }
    };
    tick();
    setInterval(tick, 1000);
  },

  // ─── Log Stream ────────────────────────────────────────────

  /** Write a timestamped message into the system-log bar */
  log(message) {
    const el = document.getElementById('log-stream');
    if (!el) return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ts = `[${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
    el.innerHTML = `<span class="time">${ts}</span> ${message}`;
  },

  // ─── Toast Notifications ───────────────────────────────────

  _toastContainer: null,

  _ensureToastContainer() {
    if (!this._toastContainer) {
      this._toastContainer = document.createElement('div');
      this._toastContainer.className = 'toast-container';
      document.body.appendChild(this._toastContainer);
    }
    return this._toastContainer;
  },

  /** Show a transient toast notification */
  toast(message, type = 'info', duration = 4000) {
    const container = this._ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // ─── Set Element Visibility ────────────────────────────────

  show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('visible');
  },

  hide(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  },

  // ─── Set Text Content ──────────────────────────────────────

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },

  // ─── Set HTML Content ──────────────────────────────────────

  setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  },

  // ─── Set Input Value ───────────────────────────────────────

  setValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value;
  },

  // ─── Get Input Value ───────────────────────────────────────

  getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : null;
  },

  // ─── Enable / Disable ──────────────────────────────────────

  setDisabled(id, disabled) {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  },

  // ─── Tab Management ────────────────────────────────────────

  /** Switch to a named tab panel */
  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    const btn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
    const panel = document.getElementById(`tab-${tabName}`);
    if (btn) btn.classList.add('active');
    if (panel) panel.classList.add('active');
  },

  /** Set the auction status text and optional color */
  setAuctionStatus(text, color) {
    const el = document.getElementById('auction-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'auction-status';
    if (color) el.style.color = color;
  }
};
