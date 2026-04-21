// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://nuaoxwpdanulspzoyjvp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51YW94d3BkYW51bHNwem95anZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODQ1NjMsImV4cCI6MjA5MjE2MDU2M30.v3D2dSEd1-urhfJuqpulKuTh0ku6Y7ytNcax4lR7n4g';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser   = null;
let portfolios    = [];
let activePortfolioId = null;
let heatmapDate   = new Date();

let currentFilter = 'all';
let currentSort   = { key: 'date', dir: -1 };
let selectedDir   = 'Long';
let selectedTag   = '';
let editingId     = null;
let currentPage   = 1;
const rowsPerPage = 50;
let lastEmailSent = 0;
const EMAIL_COOLDOWN = 30000; // 

// ─── SYMBOL PRESETS (Contract Size / Multiplier) ──────────────────────────────
const SYMBOL_PRESETS = {
  "XAUUSD": { mult: 100,    label: "100 oz/lot" },
  "EURUSD": { mult: 100000, label: "100,000 units/lot" },
  "GBPUSD": { mult: 100000, label: "100,000 units/lot" },
  "NQ1!":   { mult: 20,     label: "$20/point" },
};

function applySymbolPreset() {
  const sel    = document.getElementById('f-sym-select');
  const custom = document.getElementById('f-sym-custom');
  const mult   = document.getElementById('f-mult');
  const hint   = document.getElementById('sym-hint');

  if (!sel) return;

  if (sel.value === 'OTHER') {
    if (custom) { custom.style.display = 'block'; custom.value = ''; }
    if (mult)   mult.value = 1;
    if (hint)   hint.textContent = '';
  } else {
    const preset = SYMBOL_PRESETS[sel.value];
    if (custom) custom.style.display = 'none';
    if (mult)   mult.value = preset ? preset.mult : 1;
    if (hint)   hint.textContent = preset ? `Contract size: ${preset.label}` : '';
  }

  if (typeof updatePreview === 'function') updatePreview();
}

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

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function pnl(t) {
  // Supabase stores entry_price / exit_price — fallback for legacy data
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

// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showApp();
  } else {
    showAuthScreen();
  }
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) showApp();
    else showAuthScreen();
  });
}

function showAuthScreen() {
  document.getElementById('authScreen').style.display  = 'flex';
  document.getElementById('appWrapper').style.display  = 'none';
}

async function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appWrapper').style.display  = 'block';
  document.getElementById('userEmail').textContent = currentUser.email;
  showLoading(true);
  await loadAllData();
  showLoading(false);
  initAppListeners();
  renderPortfolioTabs();
  render();
  startTickerRefresh();
}

async function register() {
  if (!canSendEmail()) return;

  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  if (!email || !pass) { authError('กรุณาใส่ email และ password'); return; }
  if (pass.length < 6)  { authError('Password ต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
  setAuthLoading(true);
  const { error } = await sb.auth.signUp({ email, password: pass });
  setAuthLoading(false);

  if (!email.includes('@')) {
    authError('Email ไม่ถูกต้อง');
    return; 
  }

  if (pass.length < 6) {
    authError('Password ต้อง ≥ 6 ตัว');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    authError('รูปแบบ email ไม่ถูกต้อง');
    return;
  }

  if (error) { authError(error.message); return; }
  authSuccess('สมัครสมาชิกสำเร็จ! ✓ กรุณาเช็ค email เพื่อยืนยัน');
}

async function login() {
  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  if (!email || !pass) { authError('กรุณาใส่ email และ password'); return; }
  setAuthLoading(true);
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  setAuthLoading(false);
  if (error) { authError('Email หรือ Password ไม่ถูกต้อง'); return; }
}

async function logout() {
  await sb.auth.signOut();
  portfolios = []; activePortfolioId = null;
}

async function forgotPassword() {
  if (!canSendEmail()) return;
  const email = document.getElementById('a-email').value.trim();
  if (!email) { authError('ใส่ email ก่อนแล้วกด Forgot Password'); return; }
  setAuthLoading(true);
  const { error } = await sb.auth.resetPasswordForEmail(email);
  setAuthLoading(false);
  if (error) { authError(error.message); return; }
  authSuccess('ส่ง reset link ไปที่ email แล้ว ✓');
}

function authError(msg) {
  const el = document.getElementById('authMsg');
  el.textContent = msg; el.className = 'auth-msg error'; el.style.display = 'block';
}
function authSuccess(msg) {
  const el = document.getElementById('authMsg');
  authSuccess('ส่ง email แล้ว กรุณารอ 30 วินาที');
  el.textContent = msg; el.className = 'auth-msg success'; el.style.display = 'block';
}
function setAuthLoading(on) {
  const isRegister = document.getElementById('authTitle').textContent === 'REGISTER';
  document.getElementById('btn-login').disabled    = on;
  document.getElementById('btn-register').disabled = on;
  const forgotBtn = document.querySelector('.btn-ghost');
  if (forgotBtn) forgotBtn.disabled = on;
  if (isRegister) {
    document.getElementById('btn-register').textContent = on ? 'LOADING...' : 'CREATE ACCOUNT ▸';
  } else {
    document.getElementById('btn-login').textContent = on ? 'LOADING...' : 'LOGIN ▸';
  }
}
function toggleAuthMode() {
  const title   = document.getElementById('authTitle');
  const isLogin = title.textContent === 'LOGIN';
  title.textContent = isLogin ? 'REGISTER' : 'LOGIN';
  document.getElementById('btn-login').style.display    = isLogin ? 'none'  : 'block';
  document.getElementById('btn-register').style.display = isLogin ? 'block' : 'none';
  document.getElementById('authToggleMsg').textContent  = isLogin ? 'มีบัญชีแล้ว?' : 'ยังไม่มีบัญชี?';
  document.getElementById('authToggleLink').textContent = isLogin ? 'Login' : 'Register';
  document.getElementById('authMsg').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  ['a-email','a-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const isRegister = document.getElementById('authTitle').textContent === 'REGISTER';
        isRegister ? register() : login();
      }
    });
  });
});

// Checking Email
function canSendEmail() {
  const now = Date.now();

  if (now - lastEmailSent < EMAIL_COOLDOWN) {
    const remain = Math.ceil((EMAIL_COOLDOWN - (now - lastEmailSent)) / 1000);
    toast(`รออีก ${remain} วินาที`, 'error');
    return false;
  }

  lastEmailSent = now;
  return true;
}

// ─── SUPABASE DATA LAYER ──────────────────────────────────────────────────────
async function loadAllData() {
  const { data: ports, error: pErr } = await sb
    .from('portfolios').select('*').order('created_at', { ascending: true });
  if (pErr) { toast('Error loading portfolios', 'error'); return; }

  const { data: trades, error: tErr } = await sb
    .from('trades').select('*').order('date', { ascending: true });
  if (tErr) { toast('Error loading trades', 'error'); return; }

  portfolios = (ports || []).map(p => ({
    ...p,
    trades: (trades || []).filter(t => t.portfolio_id === p.id)
  }));

  if (portfolios.length === 0) {
    document.getElementById('welcomeOverlay').classList.add('open');
    setTimeout(() => document.getElementById('w-name')?.focus(), 200);
  } else {
    const savedId = localStorage.getItem('active_portfolio_' + currentUser.id);
    activePortfolioId = savedId && portfolios.find(p => p.id === savedId)
      ? savedId : portfolios[0].id;
  }
}

async function dbCreatePortfolio(name, balance) {
  const { data, error } = await sb.from('portfolios')
    .insert({ name, balance: parseFloat(balance), user_id: currentUser.id })
    .select().single();
  if (error) { toast('Error creating portfolio', 'error'); return null; }
  return { ...data, trades: [] };
}
async function dbUpdatePortfolio(id, name, balance) {
  const { error } = await sb.from('portfolios').update({ name, balance: parseFloat(balance) }).eq('id', id);
  if (error) { toast('Error updating portfolio', 'error'); return false; }
  return true;
}
async function dbDeletePortfolio(id) {
  const { error } = await sb.from('portfolios').delete().eq('id', id);
  if (error) { toast('Error deleting portfolio', 'error'); return false; }
  return true;
}
async function dbSaveTrade(portfolioId, d) {
  const { data, error } = await sb.from('trades').insert({
    portfolio_id: portfolioId, user_id: currentUser.id,
    date: d.date, sym: d.sym, dir: d.dir,
    entry_price: d.entry, exit_price: d.exit,
    size: d.size, multiplier: d.multiplier || 1,
    note: d.note || '', tag: d.tag || '', account: d.account || 0,
  }).select().single();
  if (error) { toast('Error saving trade', 'error'); return null; }
  return data;
}
async function dbUpdateTrade(id, d) {
  const { error } = await sb.from('trades').update({
    date: d.date, sym: d.sym, dir: d.dir,
    entry_price: d.entry, exit_price: d.exit,
    size: d.size, multiplier: d.multiplier || 1,
    note: d.note || '', tag: d.tag || '', account: d.account || 0,
  }).eq('id', id);
  if (error) { toast('Error updating trade', 'error'); return false; }
  return true;
}
async function dbDeleteTrade(id) {
  const { error } = await sb.from('trades').delete().eq('id', id);
  if (error) { toast('Error deleting trade', 'error'); return false; }
  return true;
}
function saveActivePortfolio() {
  if (currentUser) localStorage.setItem('active_portfolio_' + currentUser.id, activePortfolioId);
}

// ─── PORTFOLIO FUNCTIONS ──────────────────────────────────────────────────────
async function createPortfolio(name, balance) {
  const p = await dbCreatePortfolio(name, balance); if (!p) return null;
  portfolios.push(p); activePortfolioId = p.id; saveActivePortfolio(); return p;
}
function switchPortfolio(id) {
  activePortfolioId = id; saveActivePortfolio(); currentPage = 1; renderPortfolioTabs(); render();
}
function renderPortfolioTabs() {
  const container = document.getElementById('portfolioTabs'); if (!container) return;
  container.innerHTML = portfolios.map(p =>
    `<button class="portfolio-tab ${p.id === activePortfolioId ? 'active' : ''}" onclick="switchPortfolio('${p.id}')">${p.name}</button>`
  ).join('') + `<button class="portfolio-tab-add" onclick="openNewPortfolioModal()" title="New portfolio">+</button>`;
}
function openPortfolioSettings() {
  const p = getActivePortfolio(); if (!p) return;
  document.getElementById('ps-name').value    = p.name;
  document.getElementById('ps-balance').value = p.balance;
  document.getElementById('portfolioSettingsOverlay').classList.add('open');
}
async function savePortfolioSettings() {
  const p = getActivePortfolio(); if (!p) return;
  const name    = document.getElementById('ps-name').value.trim();
  const balance = parseFloat(document.getElementById('ps-balance').value);
  if (!name)                          { toast('ใส่ชื่อพอร์ตก่อนนะ', 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast('ใส่ balance ให้ถูกต้อง', 'error'); return; }
  const ok = await dbUpdatePortfolio(p.id, name, balance); if (!ok) return;
  p.name = name; p.balance = balance;
  document.getElementById('portfolioSettingsOverlay').classList.remove('open');
  renderPortfolioTabs(); render(); toast('Portfolio updated ✓');
}
async function deletePortfolio() {
  const p = getActivePortfolio(); if (!p) return;
  if (portfolios.length <= 1) { toast('ต้องมีอย่างน้อย 1 พอร์ต', 'error'); return; }
  if (!confirm(`ลบพอร์ต "${p.name}" และ trade ทั้งหมด?`)) return;
  const ok = await dbDeletePortfolio(p.id); if (!ok) return;
  portfolios = portfolios.filter(x => x.id !== p.id);
  activePortfolioId = portfolios[0].id; saveActivePortfolio(); currentPage = 1;
  document.getElementById('portfolioSettingsOverlay').classList.remove('open');
  renderPortfolioTabs(); render(); toast('Portfolio deleted', 'error');
}
function openNewPortfolioModal() {
  document.getElementById('np-name').value = ''; document.getElementById('np-balance').value = '';
  document.getElementById('newPortfolioOverlay').classList.add('open');
  setTimeout(() => document.getElementById('np-name')?.focus(), 100);
}
async function saveNewPortfolio() {
  const name    = document.getElementById('np-name').value.trim();
  const balance = parseFloat(document.getElementById('np-balance').value);
  if (!name)                          { toast('ใส่ชื่อพอร์ตก่อนนะ', 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast('ใส่ balance ให้ถูกต้อง', 'error'); return; }
  const p = await createPortfolio(name, balance); if (!p) return;
  document.getElementById('newPortfolioOverlay').classList.remove('open');
  renderPortfolioTabs(); render(); toast('Portfolio created ✓');
}
async function saveWelcome() {
  const name    = document.getElementById('w-name').value.trim();
  const balance = parseFloat(document.getElementById('w-balance').value);
  if (!name)                          { toast('ใส่ชื่อพอร์ตก่อนนะ', 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast('ใส่ Balance ให้ถูกต้อง', 'error'); return; }
  const p = await createPortfolio(name, balance); if (!p) return;
  document.getElementById('welcomeOverlay').classList.remove('open');
  renderPortfolioTabs(); render();
}

// ─── CURSOR, LIVE TIME, THEME ─────────────────────────────────────────────────
function updateTime() {
  const el = document.getElementById('liveTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateTime, 1000); updateTime();

// ─── TICKER ───────────────────────────────────────────────────────────────────
let tickerPrefs = JSON.parse(localStorage.getItem('ticker_prefs')) || { speed: 30, color: '#f59e0b' };
function applyTickerStyles() {
  document.documentElement.style.setProperty('--ticker-speed', tickerPrefs.speed + 's');
  document.documentElement.style.setProperty('--ticker-hl', tickerPrefs.color);
}
applyTickerStyles();
function getMarketSessions() {
  const utcHour = new Date().getUTCHours();
  const sessions = [
    { name: '🇦🇺 SYDNEY',   open: 22, close: 7  },
    { name: '🇯🇵 TOKYO',    open: 0,  close: 9  },
    { name: '🇬🇧 LONDON',   open: 8,  close: 16 },
    { name: '🇺🇸 NEW YORK', open: 13, close: 22 }
  ];
  return sessions.map(s => {
    const isOpen = s.open < s.close ? (utcHour >= s.open && utcHour < s.close) : (utcHour >= s.open || utcHour < s.close);
    return { name: s.name, status: isOpen ? 'OPEN' : 'CLOSED' };
  });
}
function getUpcomingNews() {
  return [
    { flag: '🇺🇸', event: 'CPI m/m',          time: 'Wed 19:30', impact: 'HIGH' },
    { flag: '🇪🇺', event: 'ECB Press Conf',    time: 'Thu 19:45', impact: 'HIGH' },
    { flag: '🇺🇸', event: 'Non-Farm Payrolls', time: 'Fri 19:30', impact: 'HIGH' },
    { flag: '🇬🇧', event: 'BOE Gov Speaks',    time: 'Fri 21:00', impact: 'MED'  },
  ];
}
function buildForexTicker() {
  const ticker = document.getElementById('ticker'); if (!ticker) return;
  const sessions = getMarketSessions(), news = getUpcomingNews();
  const sessionHtml = sessions.map(s =>
    `<span class="ticker-item"><span class="sym">${s.name}</span><span class="chg" style="${s.status==='CLOSED'?'color:var(--muted)':'color:var(--green)'}">${s.status==='OPEN'?'🟢 OPEN':'🔴 CLOSED'}</span></span><span class="ticker-sep">|</span>`
  ).join('');
  const newsHtml = news.map(n =>
    `<span class="ticker-item"><span class="sym">${n.flag} ${n.event}</span><span style="color:var(--text);opacity:0.8">${n.time}</span><span class="chg ${n.impact==='HIGH'?'neg':'orange'}">${n.impact==='HIGH'?'🔥':'⚠️'}</span></span><span class="ticker-sep">|</span>`
  ).join('');
  const fullHtml = sessionHtml + `<span class="ticker-item" style="color:var(--ticker-hl);font-family:var(--mono);letter-spacing:2px;font-size:10px;">UPCOMING NEWS ⚡</span><span class="ticker-sep">|</span>` + newsHtml;
  ticker.innerHTML = fullHtml + fullHtml;
}
function startTickerRefresh() { buildForexTicker(); setInterval(buildForexTicker, 60000); }
function openTickerSettings() {
  const overlay = document.getElementById('tickerSettingsOverlay'); if (!overlay) return;
  overlay.classList.add('open');
  const speedEl = document.getElementById('ts-speed'), speedVal = document.getElementById('speed-val'), colorInput = document.getElementById('ts-color');
  if (speedEl) { speedEl.value = tickerPrefs.speed; if (speedVal) speedVal.innerText = tickerPrefs.speed + 's'; }
  if (colorInput) colorInput.value = tickerPrefs.color;
  document.querySelectorAll('.ticker-color-btn').forEach(b => b.classList.toggle('active-color', b.dataset.color === tickerPrefs.color));
  if (speedEl && speedVal) speedEl.oninput = () => { speedVal.innerText = speedEl.value + 's'; };
}
function selectTickerColor(el, color) {
  document.getElementById('ts-color').value = color;
  document.querySelectorAll('.ticker-color-btn').forEach(b => b.classList.remove('active-color'));
  el.classList.add('active-color');
}
function applyTickerSettings() {
  const speedEl = document.getElementById('ts-speed'), colorInput = document.getElementById('ts-color');
  if (speedEl) tickerPrefs.speed = parseInt(speedEl.value) || 30;
  if (colorInput && colorInput.value) tickerPrefs.color = colorInput.value;
  localStorage.setItem('ticker_prefs', JSON.stringify(tickerPrefs));
  applyTickerStyles(); buildForexTicker();
  document.getElementById('tickerSettingsOverlay').classList.remove('open'); toast('Ticker settings applied ✓');
}
function closeTickerSettings(e) {
  if (!e || e.target === document.getElementById('tickerSettingsOverlay'))
    document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
}

// ─── EQUITY CURVE ─────────────────────────────────────────────────────────────
function drawEquity() {
  const trades = getActiveTrades(), canvas = document.getElementById('equityCanvas'); if (!canvas) return;
  const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth; if (W === 0) return;
  canvas.width = W * dpr; canvas.height = 120 * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const isLight = document.documentElement.classList.contains('light');
  const sorted  = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    document.getElementById('equityStats').innerHTML = `<div class="equity-stat"><div class="el">TOTAL P&L</div><div class="ev">+0.00</div></div><div class="equity-stat"><div class="el">WIN RATE</div><div class="ev">0%</div></div><div class="equity-stat"><div class="el">MAX DRAWDOWN</div><div class="ev neg">0.00</div></div><div class="equity-stat"><div class="el">TRADES</div><div class="ev">0</div></div>`;
    return;
  }
  const points = [0]; let running = 0;
  sorted.forEach(t => { running += pnl(t); points.push(running); });
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1, pad = 10;
  const xs = i => (i / (points.length - 1)) * (W - pad * 2) + pad;
  const ys = v => 100 - ((v - min) / range) * 80 + 10;
  const isPos = running >= 0;
  const lineColor = isPos ? (isLight ? '#16a34a' : '#3cffa0') : (isLight ? '#dc2626' : '#ff4560');
  const fillA     = isPos ? (isLight ? 'rgba(22,163,74,0.15)' : 'rgba(60,255,160,0.2)') : (isLight ? 'rgba(220,38,38,0.15)' : 'rgba(255,69,96,0.2)');
  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, fillA); grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.moveTo(xs(0), ys(points[0]));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(xs(i), ys(p)); });
  ctx.lineTo(xs(points.length - 1), 120); ctx.lineTo(xs(0), 120); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.moveTo(xs(0), ys(points[0]));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(xs(i), ys(p)); });
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, ys(0)); ctx.lineTo(W - pad, ys(0));
  ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);
  points.forEach((p, i) => {
    const win = i > 0 && pnl(sorted[i - 1]) > 0;
    ctx.beginPath(); ctx.arc(xs(i), ys(p), 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? (isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)') : (win ? lineColor : (isLight ? '#dc2626' : '#ff4560'));
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '10px "Space Mono"'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(fmtNum(max, 0), W - pad, ys(max) + (max === points[points.length-1] ? -10 : 10));
  if (min !== max) ctx.fillText(fmtNum(min, 0), W - pad, ys(min) - 10);
  if (min < 0 && max > 0) ctx.fillText('0', W - pad, ys(0) - 6);
  let peak = points[0], maxDD = 0;
  points.forEach(p => { if (p > peak) peak = p; const dd = peak - p; if (dd > maxDD) maxDD = dd; });
  const wins = trades.filter(t => pnl(t) > 0), wr = trades.length ? (wins.length / trades.length * 100) : 0;
  document.getElementById('equityStats').innerHTML = `<div class="equity-stat"><div class="el">TOTAL P&L</div><div class="ev ${running >= 0 ? 'pos' : 'neg'}">${fmtNum(running)}</div></div><div class="equity-stat"><div class="el">WIN RATE</div><div class="ev ${wr >= 50 ? 'pos' : 'neg'}">${wr.toFixed(1)}%</div></div><div class="equity-stat"><div class="el">MAX DRAWDOWN</div><div class="ev neg">${fmtNum(-Math.abs(maxDD))}</div></div><div class="equity-stat"><div class="el">TRADES</div><div class="ev">${trades.length}</div></div>`;
}
window.addEventListener('resize', drawEquity);

// ─── METRICS ──────────────────────────────────────────────────────────────────
function renderMetrics() {
  const trades = getActiveTrades(), wins = trades.filter(t => pnl(t) > 0), losses = trades.filter(t => pnl(t) <= 0);
  const totalPnl = trades.reduce((s, t) => s + pnl(t), 0);
  const winRate = trades.length ? (wins.length / trades.length * 100) : 0;
  const avgWin  = wins.length   ? wins.reduce((s, t)   => s + pnl(t), 0) / wins.length   : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + pnl(t), 0) / losses.length) : 0;
  const rr = avgLoss ? (avgWin / avgLoss) : 0;
  const profitFactor = losses.length ? wins.reduce((s,t)=>s+pnl(t),0)/Math.abs(losses.reduce((s,t)=>s+pnl(t),0)) : (wins.length ? Infinity : 0);
  const allPnls = trades.map(t => pnl(t));
  const bestTrade = allPnls.length ? Math.max(...allPnls) : 0, worstTrade = allPnls.length ? Math.min(...allPnls) : 0;
  const port = getActivePortfolio(), portRet = port && port.balance ? (totalPnl / port.balance * 100) : 0;
  const metrics = [
    { label: 'TOTAL P&L',     val: fmtNum(totalPnl),                                    cls: totalPnl  >= 0 ? 'pos' : 'neg', sub: 'USD' },
    { label: 'NET RETURN',    val: (portRet >= 0 ? '+' : '') + portRet.toFixed(2) + '%', cls: portRet   >= 0 ? 'pos' : 'neg', sub: 'on initial bal' },
    { label: 'WIN RATE',      val: winRate.toFixed(1) + '%',                              cls: winRate   >= 50 ? 'pos' : 'neg', sub: `${wins.length}W / ${losses.length}L` },
    { label: 'AVG WIN',       val: fmtNum(avgWin),                                       cls: 'pos',                           sub: 'per trade' },
    { label: 'AVG LOSS',      val: '-' + fmtAbs(avgLoss),                                cls: 'neg',                           sub: 'per trade' },
    { label: 'BEST TRADE',    val: fmtNum(bestTrade),                                    cls: bestTrade  >= 0 ? 'pos' : 'neg', sub: 'max profit' },
    { label: 'WORST TRADE',   val: fmtNum(worstTrade),                                   cls: worstTrade <= 0 ? 'neg' : 'pos', sub: 'max drawdown' },
    { label: 'R:R RATIO',     val: rr ? rr.toFixed(2) : '—',                            cls: rr >= 1 ? 'pos' : 'neg',         sub: 'avg win / avg loss' },
    { label: 'PROFIT FACTOR', val: profitFactor === Infinity ? '∞' : (profitFactor ? profitFactor.toFixed(2) : '—'), cls: (profitFactor >= 1 || profitFactor === Infinity) ? 'accent' : 'neg', sub: 'gross profit / loss' },
  ];
  document.getElementById('metricsRow').innerHTML = metrics.map(m =>
    `<div class="metric-card"><div class="mc-label">${m.label}</div><div class="mc-val ${m.cls}">${m.val}</div><div class="mc-sub">${m.sub}</div></div>`
  ).join('');
}

// ─── TABLE + PAGINATION ───────────────────────────────────────────────────────
function getFiltered() {
  const trades = getActiveTrades(), search = (document.getElementById('searchInput')?.value || '').toUpperCase().trim();
  return trades
    .filter(t => {
      if (currentFilter === 'Long')  return t.dir === 'Long';
      if (currentFilter === 'Short') return t.dir === 'Short';
      if (currentFilter === 'win')   return pnl(t) > 0;
      if (currentFilter === 'loss')  return pnl(t) <= 0;
      return true;
    })
    .filter(t => !search || t.sym.includes(search) || (t.note||'').toUpperCase().includes(search) || (t.tag||'').toUpperCase().includes(search))
    .sort((a, b) => {
      const k = currentSort.key;
      const va = k === 'pnl' ? pnl(a) : (k === 'entry' ? a.entry_price : k === 'exit' ? a.exit_price : a[k]);
      const vb = k === 'pnl' ? pnl(b) : (k === 'entry' ? b.entry_price : k === 'exit' ? b.exit_price : b[k]);
      if (typeof va === 'string') return va.localeCompare(vb) * currentSort.dir;
      return (va - vb) * currentSort.dir;
    });
}
function renderTable() {
  const allRows = getFiltered(), tbody = document.getElementById('tradeBody');
  document.getElementById('emptyState').style.display = allRows.length ? 'none' : 'block';
  const totalPages = Math.ceil(allRows.length / rowsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const rowsToRender = allRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  tbody.innerHTML = rowsToRender.map((t, idx) => {
    const p = pnl(t), pp = pnlPct(t), win = p > 0;
    const accPct = t.account ? (p / t.account * 100) : 0;
    const accStr  = t.account ? `<br><span style="font-size:10px;color:var(--muted)">Acc: ${(accPct>=0?'+':'')+accPct.toFixed(2)}%</span>` : '';
    const multStr = (t.multiplier && t.multiplier !== 1) ? `<br><span style="font-size:9px;color:var(--muted)">x${t.multiplier}</span>` : '';
    return `<tr class="row-enter ${win?'row-win':'row-loss'}" style="animation-delay:${idx*0.02}s">
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${t.date}</td>
      <td style="font-weight:700;letter-spacing:1px;font-family:var(--mono)">${t.sym}</td>
      <td><span class="dir-tag ${t.dir==='Long'?'long':'short'}">${t.dir==='Long'?'▲':'▼'} ${t.dir.toUpperCase()}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${t.entry_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.exit_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.size}${multStr}</td>
      <td><span class="pnl-cell ${win?'pos':'neg'}">${fmtNum(p)}</span></td>
      <td style="font-family:var(--mono);font-size:11px;color:${win?'var(--green)':'var(--red)'}">${(pp>=0?'+':'')+pp.toFixed(2)}%${accStr}</td>
      <td style="color:var(--muted);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis" class="col-setup">${t.note||'—'}</td>
      <td class="col-tag">${t.tag?`<span class="tag-pill">${t.tag}</span>`:''}</td>
      <td style="display:flex;gap:8px;">
        <button class="del-btn" style="color:var(--blue)" onclick="editTrade('${t.id}')" title="Edit">✏️</button>
        <button class="del-btn" onclick="delTrade('${t.id}')" title="Delete">✕</button>
      </td></tr>`;
  }).join('');
  let pgContainer = document.getElementById('pagination-container');
  if (!pgContainer) {
    document.querySelector('.table-scroll')?.insertAdjacentHTML('beforeend', '<div id="pagination-container" style="display:flex;justify-content:center;align-items:center;gap:16px;margin:20px 0 10px;"></div>');
    pgContainer = document.getElementById('pagination-container');
  }
  if (pgContainer) pgContainer.innerHTML = totalPages > 1
    ? `<button class="btn-ghost" style="padding:4px 12px;font-size:11px;" onclick="changePage(-1)" ${currentPage===1?'disabled':''}>◀ PREV</button><span style="font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:1px;">PAGE ${currentPage} OF ${totalPages}</span><button class="btn-ghost" style="padding:4px 12px;font-size:11px;" onclick="changePage(1)" ${currentPage===totalPages?'disabled':''}>NEXT ▶</button>` : '';
}
function changePage(dir) { currentPage += dir; renderTable(); }
function setFilter(f, el) { currentFilter = f; currentPage = 1; document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active')); el.classList.add('active'); renderTable(); }
function sortBy(key) { currentSort = { key, dir: currentSort.key === key ? currentSort.dir * -1 : -1 }; currentPage = 1; renderTable(); }

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function renderBreakdown() {
  const trades = getActiveTrades(), wins = trades.filter(t => pnl(t) > 0), losses = trades.filter(t => pnl(t) <= 0);
  const total = trades.length || 1, wPct = (wins.length/total*100).toFixed(0), lPct = (losses.length/total*100).toFixed(0);
  const totalWin = wins.reduce((s,t)=>s+pnl(t),0), totalLoss = Math.abs(losses.reduce((s,t)=>s+pnl(t),0));
  document.getElementById('breakdown').innerHTML = `<div class="breakdown-bar"><div class="bar-row"><span class="bar-label">WIN</span><span style="color:var(--green)">${wins.length} (${wPct}%)</span></div><div class="bar-track"><div class="bar-fill green" style="width:${wPct}%"></div></div><div class="bar-row"><span class="bar-label">LOSS</span><span style="color:var(--red)">${losses.length} (${lPct}%)</span></div><div class="bar-track"><div class="bar-fill red" style="width:${lPct}%"></div></div><div class="bar-row" style="margin-top:4px"><span class="bar-label">GROSS PROFIT</span><span style="color:var(--green)">${fmtNum(totalWin)}</span></div><div class="bar-row"><span class="bar-label">GROSS LOSS</span><span style="color:var(--red)">-${fmtAbs(totalLoss)}</span></div></div>`;
}
function renderSymPerf() {
  const map = {}; getActiveTrades().forEach(t => { map[t.sym] = (map[t.sym]||0) + pnl(t); });
  const sorted = Object.entries(map).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,6);
  document.getElementById('symPerf').innerHTML = sorted.length ? sorted.map(([sym,p])=>`<div class="sym-row"><span class="sym-name">${sym}</span><span class="sym-pnl ${p>=0?'pos':'neg'}">${fmtNum(p)}</span></div>`).join('') : '<div style="padding:16px 20px;color:var(--muted);font-family:var(--mono);font-size:11px">No data yet</div>';
}
function renderStreak() {
  const sorted = [...getActiveTrades()].sort((a,b)=>a.date.localeCompare(b.date));
  let streak=0,streakType=null,best=0,bestType=null,cur=0,curType=null;
  sorted.forEach(t => { const type = pnl(t)>0?'win':'loss'; if(type===curType){cur++;}else{curType=type;cur=1;} if(cur>best){best=cur;bestType=type;} streak=cur;streakType=type; });
  const dots = sorted.slice(-20).map(t=>`<div class="streak-dot ${pnl(t)>0?'w':'l'}" title="${t.sym} ${pnl(t)>0?'+':''}${pnl(t).toFixed(0)}"></div>`).join('');
  document.getElementById('streakBlock').innerHTML = `<div class="streak-block"><div class="streak-num ${streakType||''}">${streak||0}</div><div class="streak-label">CURRENT ${streakType?streakType.toUpperCase()+' STREAK':'STREAK'}</div><div class="streak-dots">${dots}</div><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:12px">BEST: ${best} ${bestType?bestType.toUpperCase()+'S':'—'}</div></div>`;
}
function changeHeatmapMonth(offset) {
  heatmapDate = new Date(heatmapDate.getFullYear(), heatmapDate.getMonth() + offset, 1); renderHeatmap();
}
function renderHeatmap() {
  const isLight = document.documentElement.classList.contains('light');
  const emptyBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
  const pnlByDate = {}; getActiveTrades().forEach(t => { pnlByDate[t.date] = (pnlByDate[t.date]||0) + pnl(t); });
  const year=heatmapDate.getFullYear(), month=heatmapDate.getMonth(), startDow=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate();
  const vals=Object.values(pnlByDate).filter(v=>v!==0), maxAbs=vals.length?Math.max(...vals.map(Math.abs)):1;
  let cells=''; for(let i=0;i<startDow;i++) cells+=`<div class="hmap-cell" style="background:transparent"></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, val=pnlByDate[dateStr]||0;
    let bg=val===0?emptyBg:(val>0?`rgba(60,255,160,${Math.min(0.9,0.15+(val/maxAbs)*0.75).toFixed(2)})`:`rgba(255,69,96,${Math.min(0.9,0.15+(Math.abs(val)/maxAbs)*0.75).toFixed(2)})`);
    cells+=`<div class="hmap-cell" style="background:${bg}" title="${val!==0?dateStr+': '+fmtNum(val):dateStr}"></div>`;
  }
  document.getElementById('heatmap').innerHTML=`<div class="hmap-label">${['S','M','T','W','T','F','S'].map(d=>`<div class="hmap-day-label">${d}</div>`).join('')}</div><div class="heatmap-grid">${cells}</div><div style="display:flex;justify-content:space-between;align-items:center;padding:0 20px 12px;"><button class="btn-ghost" style="padding:2px 8px;font-size:10px" onclick="changeHeatmapMonth(-1)">◀</button><div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:1px">${heatmapDate.toLocaleString('en-US',{month:'long',year:'numeric'}).toUpperCase()}</div><button class="btn-ghost" style="padding:2px 8px;font-size:10px" onclick="changeHeatmapMonth(1)">▶</button></div>`;
}

// ─── TRADE MODAL ──────────────────────────────────────────────────────────────
function openModal() {
  editingId = null;
  document.querySelector('.modal-title').textContent = "NEW TRADE ENTRY";
  document.querySelector('.modal-footer .btn-accent').textContent = "SAVE TRADE ▸";
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);

  ['f-entry','f-exit','f-size','f-account'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  if (document.getElementById('f-note')) document.getElementById('f-note').value = '';

  const sel = document.getElementById('f-sym-select');
  const custom = document.getElementById('f-sym-custom');
  if (sel) {
    sel.value = 'XAUUSD';
    if (custom) custom.style.display = 'none';
    applySymbolPreset();
  }

  selectedTag = ''; document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
  setDir('Long'); updatePreview();
  setTimeout(() => document.getElementById('f-entry')?.focus(), 100);
}

function editTrade(id) {
  const t = getActiveTrades().find(x => x.id === id); if(!t) return;
  editingId = id; 
  document.querySelector('.modal-title').textContent = "EDIT TRADE";
  document.getElementById('modalOverlay').classList.add('open');
  
  document.getElementById('f-date').value = t.date;
  document.getElementById('f-entry').value = t.entry_price || t.entry; 
  document.getElementById('f-exit').value = t.exit_price || t.exit;
  document.getElementById('f-size').value = t.size;
  
  const sel = document.getElementById('f-sym-select');
  const custom = document.getElementById('f-sym-custom');
  const hint = document.getElementById('sym-hint');
  if (sel && custom) {
    if (SYMBOL_PRESETS[t.sym]) {
      sel.value = t.sym;
      custom.style.display = 'none';
      if (hint) hint.textContent = `Contract size: ${SYMBOL_PRESETS[t.sym].label}`;
    } else {
      sel.value = 'OTHER';
      custom.style.display = 'block';
      custom.value = t.sym;
      if (hint) hint.textContent = '';
    }
  }

  if (document.getElementById('f-mult')) document.getElementById('f-mult').value = t.multiplier || 1;
  if (document.getElementById('f-account')) document.getElementById('f-account').value = t.account || '';
  if (document.getElementById('f-note')) document.getElementById('f-note').value = t.note || '';
  
  setDir(t.dir); selectedTag = t.tag || '';
  document.querySelectorAll('.tag-btn').forEach(b => { b.textContent.trim().toUpperCase() === selectedTag.toUpperCase() ? b.classList.add('selected') : b.classList.remove('selected'); });
  updatePreview();
}

function closeModal(e) { if(e.target===document.getElementById('modalOverlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modalOverlay').classList.remove('open'); }
function setDir(dir) {
  selectedDir=dir;
  document.getElementById('btn-long').className='dir-btn'+(dir==='Long'?' active':'');
  document.getElementById('btn-short').className='dir-btn'+(dir==='Short'?' active':'');
  updatePreview();
}
function toggleTag(el,tag) { if(selectedTag===tag){selectedTag='';el.classList.remove('selected');}else{selectedTag=tag;document.querySelectorAll('.tag-btn').forEach(b=>b.classList.remove('selected'));el.classList.add('selected');} }

function updatePreview() {
  const entry = parseFloat(document.getElementById('f-entry')?.value);
  const exit = parseFloat(document.getElementById('f-exit')?.value);
  const size = parseFloat(document.getElementById('f-size')?.value);
  const acc = parseFloat(document.getElementById('f-account')?.value);
  const mult = parseFloat(document.getElementById('f-mult')?.value) || 1; 
  const pv = document.getElementById('previewVal');
  const pr = document.getElementById('previewRR');
  
  if (!isNaN(entry) && !isNaN(exit) && !isNaN(size) && size > 0) {
    const diff = selectedDir === 'Long' ? exit - entry : entry - exit;
    const p = diff * size * mult; 
    if(pv) { pv.textContent = fmtNum(p); pv.className = 'preview-val ' + (p >= 0 ? 'pos' : 'neg'); }
    
    const points = Math.abs(diff); 
    let prText = `ระยะ: ${points % 1 !== 0 ? points.toFixed(3) : points} Points`; 
    if (mult !== 1) prText += ` · x${mult}`;
    
    if (!isNaN(acc) && acc > 0) {
       const accPct = (p / acc * 100).toFixed(2);
       prText += ` <br><span style="color:${p>=0?'var(--green)':'var(--red)'}">บัญชีโต: ${(p>=0?'+':'')}${accPct}%</span>`;
    }
    if(pr) pr.innerHTML = prText;
  } else { 
    if(pv) { pv.textContent = '—'; pv.className = 'preview-val'; }
    if(pr) pr.textContent = ''; 
  }
}

// ─── APP LISTENERS (called once after #appWrapper is visible) ─────────────────
let appListenersReady = false;
function initAppListeners() {
  if (appListenersReady) return;
  appListenersReady = true;

  // Bug #3 — themeToggle inside hidden #appWrapper at load time
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
      localStorage.setItem('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
      setTimeout(drawEquity, 50);
    });
  }

  // Bug #4 — searchInput inside hidden #appWrapper at load time
  document.getElementById('searchInput')?.addEventListener('input', () => { currentPage = 1; renderTable(); });

  // Bug #5 — modal inputs inside hidden #appWrapper at load time
  ['f-entry','f-exit','f-size','f-mult','f-account'].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener('input', updatePreview);
  });
}

async function saveTrade() {
  const portfolio = getActivePortfolio(); 
  if(!portfolio){toast('ไม่มีพอร์ต — สร้างพอร์ตก่อน','error');return;}

  // 🟢 ดึงข้อมูล Symbol อย่างถูกต้อง
  const selVal = document.getElementById('f-sym-select')?.value;
  const rawSym = (selVal === 'OTHER') ? document.getElementById('f-sym-custom')?.value : selVal;
  const sym = (rawSym || '').trim().toUpperCase();

  const date=document.getElementById('f-date').value;
  const entry=parseFloat(document.getElementById('f-entry').value), exit=parseFloat(document.getElementById('f-exit').value), size=parseFloat(document.getElementById('f-size').value);
  
  const multiplier=document.getElementById('f-mult')?(parseFloat(document.getElementById('f-mult').value)||1):1;
  const note=document.getElementById('f-note')?document.getElementById('f-note').value.trim():'';
  const account=document.getElementById('f-account')?(parseFloat(document.getElementById('f-account').value)||0):0;
  
  if(!sym||!date||isNaN(entry)||isNaN(exit)||isNaN(size)){toast('Fill in all required fields','error');return;}
  
  const tradeData={date,sym,dir:selectedDir,entry,exit,size,multiplier,note,tag:selectedTag,account};
  
  if(editingId!==null){
    const ok=await dbUpdateTrade(editingId,tradeData); if(!ok) return;
    const idx=portfolio.trades.findIndex(t=>t.id===editingId);
    if(idx>-1) portfolio.trades[idx]={...portfolio.trades[idx],date,sym,dir:selectedDir,entry_price:entry,exit_price:exit,size,multiplier,note,tag:selectedTag,account};
    toast('Trade updated ✓');
  } else {
    const saved=await dbSaveTrade(portfolio.id,tradeData); if(!saved) return;
    portfolio.trades.push(saved); toast('Trade saved ✓');
  }
  
  render(); closeModalDirect();
}

async function delTrade(id) {
  if(!confirm('ลบ trade นี้?')) return;
  const p=getActivePortfolio(); if(!p) return;
  const ok=await dbDeleteTrade(id); if(!ok) return;
  p.trades=p.trades.filter(t=>t.id!==id); render(); toast('Trade deleted','error');
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportCSV() {
  const header='Date,Symbol,Direction,Entry,Exit,Size,Multiplier,PnL,PnL%,Setup,Tag';
  const rows=getFiltered().map(t=>[t.date,t.sym,t.dir,t.entry_price,t.exit_price,t.size,(t.multiplier||1),pnl(t).toFixed(2),pnlPct(t).toFixed(2)+'%',`"${(t.note||'').replace(/"/g,'""')}"`,t.tag||''].join(','));
  const url=URL.createObjectURL(new Blob([header+'\n'+rows.join('\n')],{type:'text/csv'}));
  const a=document.createElement('a'); a.href=url; a.download=`${getActivePortfolio()?.name||'tradelog'}_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); toast('CSV exported ↓');
}
function exportNotion() {
  const header='Date\tSymbol\tDirection\tEntry\tExit\tSize\tMult\tP&L\tP&L%\tResult\tSetup\tTag';
  const rows=getFiltered().map(t=>[t.date,t.sym,t.dir,t.entry_price,t.exit_price,t.size,(t.multiplier||1),(pnl(t)>=0?'+':'')+pnl(t).toFixed(2),(pnlPct(t)>=0?'+':'')+pnlPct(t).toFixed(2)+'%',pnl(t)>0?'Win':'Loss',t.note||'',t.tag||''].join('\t'));
  document.getElementById('notionText').value=header+'\n'+rows.join('\n'); document.getElementById('notionOverlay').classList.add('open');
}
function closeNotion(e) { if(e.target===document.getElementById('notionOverlay')) document.getElementById('notionOverlay').classList.remove('open'); }
function copyNotion() {
  navigator.clipboard.writeText(document.getElementById('notionText').value).then(()=>{
    const msg=document.getElementById('copiedMsg'); if(msg){msg.style.opacity=1;setTimeout(()=>msg.style.opacity=0,2000);} toast('Copied to clipboard ✓');
  }).catch(()=>toast('Copy failed — select all and copy manually','error'));
}

document.addEventListener('keydown', e => {
  if(e.key==='Escape'){
    closeModalDirect(); document.getElementById('notionOverlay')?.classList.remove('open');
    document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
    document.getElementById('portfolioSettingsOverlay')?.classList.remove('open');
    document.getElementById('newPortfolioOverlay')?.classList.remove('open');
  }
  if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();openModal();}
});

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function render() { drawEquity(); renderMetrics(); renderTable(); renderBreakdown(); renderSymPerf(); renderStreak(); renderHeatmap(); }

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => { initAuth(); });
