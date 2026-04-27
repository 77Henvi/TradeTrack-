// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://nuaoxwpdanulspzoyjvp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51YW94d3BkYW51bHNwem95anZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODQ1NjMsImV4cCI6MjA5MjE2MDU2M30.v3D2dSEd1-urhfJuqpulKuTh0ku6Y7ytNcax4lR7n4g';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
let currentUser       = null;
let portfolios        = [];
let activePortfolioId = null;
let heatmapDate       = new Date();

let currentFilter = 'all';
let currentSort   = { key: 'date', dir: -1 };
let selectedDir   = 'Long';
let selectedTag   = '';
let editingId     = null;
let currentPage   = 1;
const rowsPerPage = 50;
let lastEmailSent = 0;
const EMAIL_COOLDOWN = 30000;

// ─── SYMBOL PRESETS ───────────────────────────────────────────────────────────
const SYMBOL_PRESETS = {
  "XAUUSD": { mult: 100,    label: "100 oz/lot" },
  "EURUSD": { mult: 100000, label: "100,000 units/lot" },
  "GBPUSD": { mult: 100000, label: "100,000 units/lot" },
  "NQ1!":   { mult: 20,     label: "$20/point" },
};

// ─── PORTFOLIO HELPERS ────────────────────────────────────────────────────────
function getActivePortfolio() { return portfolios.find(p => p.id === activePortfolioId) || portfolios[0]; }
function getActiveTrades()    { return getActivePortfolio()?.trades || []; }

// ─── SOUND ────────────────────────────────────────────────────────────────────
let soundUnlocked = false, tickAudio = null;
function unlockSound() {
  if (soundUnlocked) return; soundUnlocked = true;
  try { tickAudio = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
}
document.addEventListener('click',   unlockSound, { once: true });
document.addEventListener('keydown', unlockSound, { once: true });
function playTick() {
  if (!soundUnlocked || !tickAudio) return;
  try {
    const o = tickAudio.createOscillator(), g = tickAudio.createGain();
    o.connect(g); g.connect(tickAudio.destination);
    o.frequency.value = 880; g.gain.setValueAtTime(0.08, tickAudio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, tickAudio.currentTime + 0.08);
    o.start(tickAudio.currentTime); o.stop(tickAudio.currentTime + 0.08);
  } catch(e) {}
}

// ─── PURE HELPERS ─────────────────────────────────────────────────────────────
function pnl(t) {
  const entry = t.entry_price ?? t.entry;
  const exit  = t.exit_price  ?? t.exit;
  const diff  = t.dir === 'Long' ? exit - entry : entry - exit;
  const mult  = parseFloat(t.multiplier) || parseFloat(t.mult) || 1;
  return diff * t.size * mult;
}
function pnlPct(t) {
  if (!t.entry_price) return 0;
  const diff = t.dir === 'Long' ? t.exit_price - t.entry_price : t.entry_price - t.exit_price;
  return (diff / t.entry_price * 100);
}
function fmtNum(n, dec = 2) {
  return (n === undefined || n === null || isNaN(n)) ? '—'
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
