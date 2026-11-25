// SUPABASE CONFIG
const SUPABASE_URL = 'https://urgrcxjeackcvaaoayja.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9dNez8F0loJTUNq0_dLd3w_wqn8K_vQ';

// AUTH & SECURITY
const ENABLE_TURNSTILE = false; // Toggle to true once Cloudflare Turnstile sitekey is set in index.html

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// GLOBAL STATE
let currentUser       = null;
let portfolios        = [];
let activePortfolioId = null;
let heatmapDate       = new Date();

let currentFilter = 'all';
let currentDateFilter = 'all';   // all | month | week | 30d
let currentSort   = { key: 'date', dir: -1 };
let selectedDir   = 'Long';
let selectedTag   = '';
let editingId     = null;
let currentPage   = 1;
const rowsPerPage = 50;
let lastEmailSent = 0;
const EMAIL_COOLDOWN = 30000;

// SYMBOL PRESETS
const SYMBOL_PRESETS = {
  "XAUUSD": { mult: 100,    label: "100 oz/lot" },
  "EURUSD": { mult: 100000, label: "100,000 units/lot" },
  "GBPUSD": { mult: 100000, label: "100,000 units/lot" },
  "NQ1!":   { mult: 20,     label: "$20/point" },
};

// PORTFOLIO HELPERS
function getActivePortfolio() { return portfolios.find(p => p.id === activePortfolioId) || portfolios[0]; }
function getActiveTrades()    { return getActivePortfolio()?.trades || []; }

// Balance of ONE portfolio = starting balance + P&L of ALL its trades (never date-filtered).
// Hero card, account card and the portfolio grid must all read from here so they can't drift apart.
function portfolioStats(p) {
  const start = (p && p.balance) || 0;
  const total = ((p && p.trades) || []).reduce((s, t) => s + pnl(t), 0);
  return { start, pnl: total, bal: start + total, ret: start ? (total / start * 100) : 0 };
}

// PURE HELPERS
function pnl(t) {
  const entry = t.entry_price ?? t.entry;
  const exit  = t.exit_price  ?? t.exit;
  const diff  = t.dir === 'Long' ? exit - entry : entry - exit;
  const mult  = parseFloat(t.multiplier) || parseFloat(t.mult) || 1;
  return diff * t.size * mult;
}
function pnlPct(t) {
  const entry = t.entry_price ?? t.entry;
  const exit  = t.exit_price  ?? t.exit;
  if (!entry) return 0;
  const diff  = t.dir === 'Long' ? exit - entry : entry - exit;
  return (diff / entry * 100);
}
function fmtNum(n, dec = 2) {
  return (n === undefined || n === null || isNaN(n)) ? '-'
    : (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtAbs(n, dec = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast ' + type;
  void el.offsetWidth; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}
function showLoading(show) {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// FINNHUB — free tier key, replace if rate-limited
const FINNHUB_KEY = 'd83j3spr01qkm5c8b8fgd83j3spr01qkm5c8b8g0';

// HTML ESCAPE — prevent XSS in innerHTML
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// CUSTOM CONFIRM DIALOG
function confirmDialog(msg) {
  return new Promise(resolve => {
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmOverlay').classList.add('open');
    const yes = document.getElementById('confirmYes');
    const no  = document.getElementById('confirmNo');
    const cleanup = (val) => {
      document.getElementById('confirmOverlay').classList.remove('open');
      yes.onclick = null; no.onclick = null;
      resolve(val);
    };
    yes.onclick = () => cleanup(true);
    no.onclick  = () => cleanup(false);
  });
}
