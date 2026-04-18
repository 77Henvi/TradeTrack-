// ─── STATE ───────────────────────────────────────────────────────────────────
let portfolios = [];
let activePortfolioId = null;
let heatmapDate = new Date();

try {
  const saved = JSON.parse(localStorage.getItem('tradelog_v3'));
  if (Array.isArray(saved) && saved.length) {
    portfolios = saved;
    activePortfolioId = parseInt(localStorage.getItem('active_portfolio')) || saved[0].id;
  }
} catch (e) { portfolios = []; }

let nextPortfolioId = portfolios.length ? Math.max(...portfolios.map(p => p.id)) + 1 : 1;
let nextTradeId     = portfolios.length
  ? Math.max(...portfolios.flatMap(p => p.trades.map(t => t.id)), 0) + 1
  : 1;

let currentFilter = 'all';
let currentSort   = { key: 'date', dir: -1 };
let selectedDir   = 'Long';
let selectedTag   = '';
let editingId = null; 

// ─── PORTFOLIO HELPERS ────────────────────────────────────────────────────────
function getActivePortfolio() {
  return portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
}

function getActiveTrades() {
  return getActivePortfolio()?.trades || [];
}

// ─── SAVE ─────────────────────────────────────────────────────────────────────
function save() {
  localStorage.setItem('tradelog_v3', JSON.stringify(portfolios));
  localStorage.setItem('active_portfolio', activePortfolioId);
}

// ─── SOUND ────────────────────────────────────────────────────────────────────
let soundUnlocked = false;
let tickAudio = null;

function unlockSound() {
  if (soundUnlocked) return;
  soundUnlocked = true;
  try {
    tickAudio = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {}
}

document.addEventListener('click', unlockSound, { once: true });
document.addEventListener('keydown', unlockSound, { once: true });

function playTick() {
  if (!soundUnlocked || !tickAudio) return;
  try {
    const o = tickAudio.createOscillator();
    const g = tickAudio.createGain();
    o.connect(g); g.connect(tickAudio.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, tickAudio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, tickAudio.currentTime + 0.08);
    o.start(tickAudio.currentTime);
    o.stop(tickAudio.currentTime + 0.08);
  } catch (e) {}
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function pnl(t) {
  const diff = t.dir === 'Long' ? t.exit - t.entry : t.entry - t.exit;
  return diff * t.size;
}

function pnlPct(t) {
  const cost = t.entry * t.size;
  return cost ? (pnl(t) / cost * 100) : 0;
}

function fmtNum(n, dec = 2) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtAbs(n, dec = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

// mini sparkline SVG
function genSparkline(chg) {
  const pts = [];
  let v = 50;
  for (let i = 0; i < 10; i++) {
    v += (Math.random() - (chg < 0 ? 0.4 : 0.6)) * 8;
    v = Math.max(10, Math.min(90, v));
    pts.push(v);
  }
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1;
  const path = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * 36;
    const y = 12 - ((v - min) / range) * 12;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const color = chg >= 0 ? '#22c55e' : '#ef4444';
  return `<svg width="36" height="12" viewBox="0 0 36 12" style="display:block">
    <path d="${path}" stroke="${color}" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// ─── PORTFOLIO FUNCTIONS ──────────────────────────────────────────────────────
function createPortfolio(name, balance) {
  const p = { id: nextPortfolioId++, name, balance: parseFloat(balance), trades: [] };
  portfolios.push(p);
  activePortfolioId = p.id;
  save();
  return p;
}

function switchPortfolio(id) {
  activePortfolioId = id;
  save();
  renderPortfolioTabs();
  render();
}

function renderPortfolioTabs() {
  const container = document.getElementById('portfolioTabs');
  if (!container) return;

  const tabs = portfolios.map(p => `
    <button
      class="portfolio-tab ${p.id === activePortfolioId ? 'active' : ''}"
      onclick="switchPortfolio(${p.id})"
    >${p.name}</button>
  `).join('');

  container.innerHTML = tabs + `
    <button class="portfolio-tab-add" onclick="openNewPortfolioModal()" title="New portfolio">+</button>
  `;
}

function openPortfolioSettings() {
  const p = getActivePortfolio();
  if (!p) return;
  document.getElementById('ps-name').value    = p.name;
  document.getElementById('ps-balance').value = p.balance;
  document.getElementById('portfolioSettingsOverlay').classList.add('open');
}

function savePortfolioSettings() {
  const p = getActivePortfolio();
  if (!p) return;
  const name    = document.getElementById('ps-name').value.trim();
  const balance = parseFloat(document.getElementById('ps-balance').value);
  if (!name)                     { toast('ใส่ชื่อพอร์ตก่อนนะ', 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast('ใส่ balance ให้ถูกต้อง', 'error'); return; }
  p.name    = name;
  p.balance = balance;
  save();
  renderPortfolioTabs();
  render();
  document.getElementById('portfolioSettingsOverlay').classList.remove('open');
  toast('Portfolio updated ✓');
}

function deletePortfolio() {
  const p = getActivePortfolio();
  if (!p) return;
  if (portfolios.length <= 1) { toast('ต้องมีอย่างน้อย 1 พอร์ต', 'error'); return; }
  if (!confirm(`ลบพอร์ต "${p.name}" และ trade ทั้งหมด?`)) return;
  portfolios = portfolios.filter(x => x.id !== p.id);
  activePortfolioId = portfolios[0].id;
  save();
  document.getElementById('portfolioSettingsOverlay').classList.remove('open');
  renderPortfolioTabs();
  render();
  toast('Portfolio deleted', 'error');
}

function openNewPortfolioModal() {
  document.getElementById('np-name').value    = '';
  document.getElementById('np-balance').value = '';
  document.getElementById('newPortfolioOverlay').classList.add('open');
  setTimeout(() => document.getElementById('np-name')?.focus(), 100);
}

function saveNewPortfolio() {
  const name    = document.getElementById('np-name').value.trim();
  const balance = parseFloat(document.getElementById('np-balance').value);
  if (!name)                     { toast('ใส่ชื่อพอร์ตก่อนนะ', 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast('ใส่ balance ให้ถูกต้อง', 'error'); return; }
  createPortfolio(name, balance);
  document.getElementById('newPortfolioOverlay').classList.remove('open');
  renderPortfolioTabs();
  render();
  toast('Portfolio created ✓');
}

// ─── WELCOME (first time) ─────────────────────────────────────────────────────
function checkFirstTime() {
  if (portfolios.length === 0) {
    document.getElementById('welcomeOverlay').classList.add('open');
    setTimeout(() => document.getElementById('w-name')?.focus(), 200);
  }
}

function saveWelcome() {
  const name    = document.getElementById('w-name').value.trim();
  const balance = parseFloat(document.getElementById('w-balance').value);
  if (!name)                     { toast('ใส่ชื่อพอร์ตก่อนนะ', 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast('ใส่ Balance ให้ถูกต้อง', 'error'); return; }
  createPortfolio(name, balance);
  document.getElementById('welcomeOverlay').classList.remove('open');
  renderPortfolioTabs();
  render();
}

// ─── CUSTOM CURSOR ────────────────────────────────────────────────────────────
const cursorDot  = document.querySelector('.cursor-dot');
const cursorRing = document.querySelector('.cursor-ring');
let mx = -200, my = -200, rx = -200, ry = -200;
let rafId = null;

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

function animateCursor() {
  rx += (mx - rx) * 0.14;
  ry += (my - ry) * 0.14;
  if (cursorDot)  { cursorDot.style.left  = mx + 'px'; cursorDot.style.top  = my + 'px'; }
  if (cursorRing) { cursorRing.style.left = rx + 'px'; cursorRing.style.top = ry + 'px'; }
  rafId = requestAnimationFrame(animateCursor);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(rafId);
  } else {
    rafId = requestAnimationFrame(animateCursor);
  }
});

animateCursor();

document.addEventListener('mouseover', e => {
  if (e.target.matches('button, a, input, select, textarea, [onclick]')) {
    cursorRing?.style.setProperty('transform', 'translate(-50%,-50%) scale(1.5)');
  }
});
document.addEventListener('mouseout', e => {
  if (e.target.matches('button, a, input, select, textarea, [onclick]')) {
    cursorRing?.style.setProperty('transform', 'translate(-50%,-50%) scale(1)');
  }
});

// ─── LIVE TIME ────────────────────────────────────────────────────────────────
function updateTime() {
  const el = document.getElementById('liveTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
setInterval(updateTime, 1000);
updateTime();

// ─── THEME TOGGLE ─────────────────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
    setTimeout(drawEquity, 50);
  });
}

// ─── TICKER — COINGECKO ───────────────────────────────────────────────────────
const COIN_IDS = {
  BTC:  'bitcoin',        ETH:   'ethereum',        SOL:  'solana',
  BNB:  'binancecoin',    XRP:   'ripple',           ADA:  'cardano',
  AVAX: 'avalanche-2',    DOT:   'polkadot',         LINK: 'chainlink',
  MATIC:'matic-network',  DOGE:  'dogecoin',         TON:  'the-open-network',
  SUI:  'sui',            APT:   'aptos',            OP:   'optimism',
  ARB:  'arbitrum',       ATOM:  'cosmos',            LTC:  'litecoin',
  UNI:  'uniswap',        PEPE:  'pepe',
};

let selectedCoins = (() => {
  try { return JSON.parse(localStorage.getItem('ticker_coins')) || null; } catch { return null; }
})() || ['BTC','ETH','SOL','BNB','XRP','ADA','AVAX','LINK'];

let tickerPriceCache = {};
let tickerIntervalId = null;

async function fetchCoinPrices(symbols) {
  const ids = symbols.map(s => COIN_IDS[s]).filter(Boolean).join(',');
  if (!ids) return tickerPriceCache;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const result = {};
    symbols.forEach(sym => {
      const id = COIN_IDS[sym];
      if (data[id]) {
        result[sym] = { price: data[id].usd, chg: +(data[id].usd_24h_change || 0).toFixed(2) };
      }
    });
    return result;
  } catch (err) {
    console.warn('[Ticker] fetch failed:', err.message);
    return tickerPriceCache;
  }
}

function buildTicker(priceData) {
  const ticker = document.getElementById('ticker');
  if (!ticker) return;
  if (!priceData || Object.keys(priceData).length === 0) {
    ticker.innerHTML = '<span class="ticker-item" style="opacity:0.5;letter-spacing:2px">LOADING LIVE PRICES...</span>';
    return;
  }
  const items = selectedCoins.filter(s => priceData[s]).map(s => ({ sym: s, ...priceData[s] }));
  if (items.length === 0) { ticker.innerHTML = '<span class="ticker-item" style="opacity:0.5">NO DATA</span>'; return; }

  const html = [...items, ...items].map(i => {
    const priceStr = i.price >= 1
      ? i.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : i.price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    return `<span class="ticker-item">
      <span class="sym">${i.sym}</span>
      <span>$${priceStr}</span>
      <span class="chg ${i.chg >= 0 ? 'pos' : 'neg'}">${i.chg >= 0 ? '▲' : '▼'} ${Math.abs(i.chg)}%</span>
      <span class="spark">${genSparkline(i.chg)}</span>
    </span><span class="ticker-sep">|</span>`;
  }).join('');

  ticker.innerHTML = html;
  const wrap = document.querySelector('.ticker-wrap');
  if (wrap) { wrap.classList.add('flash'); setTimeout(() => wrap.classList.remove('flash'), 300); }
}

async function refreshTicker() {
  const statusDot   = document.getElementById('tickerStatus');
  const lastUpdateEl = document.getElementById('lastUpdate');
  if (statusDot) { statusDot.style.opacity = '0.3'; statusDot.style.background = '#888'; }

  const data = await fetchCoinPrices(selectedCoins);
  if (Object.keys(data).length > 0) {
    tickerPriceCache = data;
    buildTicker(data);
    playTick();
    if (statusDot) { statusDot.style.opacity = '1'; statusDot.style.background = '#22c55e'; }
    if (lastUpdateEl) {
      lastUpdateEl.textContent = new Date().toLocaleTimeString('en-US', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    }
  } else {
    if (Object.keys(tickerPriceCache).length) buildTicker(tickerPriceCache);
    if (statusDot) { statusDot.style.opacity = '1'; statusDot.style.background = '#ff4560'; }
  }
}

function startTickerRefresh() {
  if (tickerIntervalId) clearInterval(tickerIntervalId);
  buildTicker({});
  refreshTicker();
  tickerIntervalId = setInterval(refreshTicker, 60000);
}

startTickerRefresh();

// ─── TICKER SETTINGS ──────────────────────────────────────────────────────────
function openTickerSettings() {
  const overlay = document.getElementById('tickerSettingsOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  const mainDot   = document.getElementById('tickerStatus');
  const modalDot  = document.getElementById('tickerModalStatus');
  const lastUpEl  = document.getElementById('lastUpdate');
  const modalTime = document.getElementById('tickerModalTime');
  if (modalDot && mainDot) modalDot.style.background = mainDot.style.background || '#22c55e';
  if (modalTime && lastUpEl) modalTime.textContent = lastUpEl.textContent;
  renderCoinPicker();
}

function closeTickerSettings(e) {
  const overlay = document.getElementById('tickerSettingsOverlay');
  if (!e || e.target === overlay) overlay?.classList.remove('open');
}

function renderCoinPicker() {
  const grid = document.getElementById('coinPickerGrid');
  if (!grid) return;
  grid.innerHTML = Object.keys(COIN_IDS).map(sym => {
    const active = selectedCoins.includes(sym);
    return `<button class="coin-pick-btn ${active ? 'active' : ''}" onclick="toggleCoin('${sym}',this)">${sym}</button>`;
  }).join('');
  updateSelectedCount();
}

function toggleCoin(sym, el) {
  if (selectedCoins.includes(sym)) {
    if (selectedCoins.length <= 2) { toast('ต้องเลือกอย่างน้อย 2 coins', 'error'); return; }
    selectedCoins = selectedCoins.filter(s => s !== sym);
    el.classList.remove('active');
  } else {
    if (selectedCoins.length >= 15) { toast('เลือกได้สูงสุด 15 coins', 'error'); return; }
    selectedCoins.push(sym);
    el.classList.add('active');
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const el = document.getElementById('selectedCount');
  if (el) el.textContent = selectedCoins.length + ' selected';
}

function applyTickerSettings() {
  localStorage.setItem('ticker_coins', JSON.stringify(selectedCoins));
  document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
  startTickerRefresh();
  toast('Ticker updated ✓');
}

// ─── EQUITY CURVE ─────────────────────────────────────────────────────────────
function drawEquity() {
  const trades = getActiveTrades();
  const canvas = document.getElementById('equityCanvas');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W   = canvas.offsetWidth;
  if (W === 0) return;
  canvas.width  = W * dpr;
  canvas.height = 120 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const isLight = document.documentElement.classList.contains('light');

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    document.getElementById('equityStats').innerHTML = `
      <div class="equity-stat"><div class="el">TOTAL P&L</div><div class="ev">+0.00</div></div>
      <div class="equity-stat"><div class="el">WIN RATE</div><div class="ev">0%</div></div>
      <div class="equity-stat"><div class="el">MAX DRAWDOWN</div><div class="ev neg">0.00</div></div>
      <div class="equity-stat"><div class="el">TRADES</div><div class="ev">0</div></div>`;
    return;
  }

  const points = [0];
  let running = 0;
  sorted.forEach(t => { running += pnl(t); points.push(running); });

  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1, pad = 10;
  const xs = i => (i / (points.length - 1)) * (W - pad * 2) + pad;
  const ys = v => 100 - ((v - min) / range) * 80 + 10;

  const isPos     = running >= 0;
  const lineColor = isPos ? (isLight ? '#16a34a' : '#3cffa0') : (isLight ? '#dc2626' : '#ff4560');
  const fillA     = isPos ? (isLight ? 'rgba(22,163,74,0.15)' : 'rgba(60,255,160,0.2)') : (isLight ? 'rgba(220,38,38,0.15)' : 'rgba(255,69,96,0.2)');

  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, fillA); grad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.beginPath();
  ctx.moveTo(xs(0), ys(points[0]));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(xs(i), ys(p)); });
  ctx.lineTo(xs(points.length - 1), 120); ctx.lineTo(xs(0), 120); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(xs(0), ys(points[0]));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(xs(i), ys(p)); });
  ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pad, ys(0)); ctx.lineTo(W - pad, ys(0));
  ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.stroke(); ctx.setLineDash([]);

  points.forEach((p, i) => {
    const win = i > 0 && pnl(sorted[i - 1]) > 0;
    ctx.beginPath(); ctx.arc(xs(i), ys(p), 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0
      ? (isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)')
      : (win ? lineColor : (isLight ? '#dc2626' : '#ff4560'));
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px "Space Mono"';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(fmtNum(max, 0), W - pad, ys(max) + (max === points[points.length-1] ? -10 : 10));
  if (min !== max) {
    ctx.fillText(fmtNum(min, 0), W - pad, ys(min) - 10);
  }
  if (min < 0 && max > 0) {
    ctx.fillText('0', W - pad, zeroY - 6);
  }

  const totalPnl = running;
  const wins  = trades.filter(t => pnl(t) > 0);
  const wr    = trades.length ? (wins.length / trades.length * 100).toFixed(1) : '0.0';
  const maxDD = calcMaxDrawdown(points);

  document.getElementById('equityStats').innerHTML = `
    <div class="equity-stat">
      <div class="el">TOTAL P&L</div>
      <div class="ev ${running >= 0 ? 'pos' : 'neg'}">${fmtNum(running)}</div>
    </div>
    <div class="equity-stat">
      <div class="el">WIN RATE</div>
      <div class="ev ${wr >= 50 ? 'pos' : 'neg'}">${wr}%</div>
    </div>
    <div class="equity-stat">
      <div class="el">MAX DRAWDOWN</div>
      <div class="ev neg">${fmtNum(-Math.abs(maxDD))}</div>
    </div>
    <div class="equity-stat">
      <div class="el">TRADES</div>
      <div class="ev">${trades.length}</div>
    </div>`;
}

function calcMaxDrawdown(points) {
  let peak = points[0], maxDD = 0;
  points.forEach(p => { if (p > peak) peak = p; const dd = peak - p; if (dd > maxDD) maxDD = dd; });
  return maxDD;
}

window.addEventListener('resize', drawEquity);

// ─── METRICS ──────────────────────────────────────────────────────────────────
function renderMetrics() {
  const wins = trades.filter(t => pnl(t) > 0);
  const losses = trades.filter(t => pnl(t) <= 0);
  const totalPnl = trades.reduce((s, t) => s + pnl(t), 0);
  const winRate = trades.length ? (wins.length / trades.length * 100) : 0;
  const avgWin  = wins.length ? wins.reduce((s, t) => s + pnl(t), 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + pnl(t), 0) / losses.length) : 0;
  const rr = avgLoss ? (avgWin / avgLoss) : 0;
  const profitFactor = avgLoss && losses.length ?
    (wins.reduce((s, t) => s + pnl(t), 0)) / Math.abs(losses.reduce((s, t) => s + pnl(t), 0)) : 0;

  // --- คำนวณ Best & Worst Trade ตรงนี้ ---
  const allPnls = trades.map(t => pnl(t));
  const bestTrade = allPnls.length ? Math.max(...allPnls) : 0;
  const worstTrade = allPnls.length ? Math.min(...allPnls) : 0;

  // --- เพิ่มเข้าไปใน Array นี้ 2 บรรทัด ---
  const metrics = [
    { label: 'TOTAL P&L',     val: fmtNum(totalPnl),        cls: totalPnl >= 0 ? 'pos' : 'neg', sub: 'USD' },
    { label: 'WIN RATE',      val: winRate.toFixed(1) + '%', cls: winRate >= 50 ? 'pos' : 'neg', sub: `${wins.length}W / ${losses.length}L` },
    { label: 'AVG WIN',       val: fmtNum(avgWin),           cls: 'pos', sub: 'per trade' },
    { label: 'AVG LOSS',      val: '-' + fmtAbs(avgLoss),    cls: 'neg', sub: 'per trade' },
    { label: 'BEST TRADE',    val: fmtNum(bestTrade),        cls: bestTrade > 0 ? 'pos' : '', sub: 'max profit' },
    { label: 'WORST TRADE',   val: fmtNum(worstTrade),       cls: worstTrade < 0 ? 'neg' : '', sub: 'max drawdown' },
    { label: 'R:R RATIO',     val: rr ? rr.toFixed(2) : '—', cls: rr >= 1 ? 'pos' : 'neg', sub: 'avg win / avg loss' },
    { label: 'PROFIT FACTOR', val: profitFactor ? profitFactor.toFixed(2) : '—', cls: profitFactor >= 1 ? 'accent' : 'neg', sub: 'gross profit / loss' },
    { label: 'TOTAL TRADES',  val: trades.length,            cls: '',    sub: 'logged' },
  ];

  document.getElementById('metricsRow').innerHTML = metrics.map(m =>
    `<div class="metric-card">
      <div class="mc-label">${m.label}</div>
      <div class="mc-val ${m.cls}">${m.val}</div>
      <div class="mc-sub">${m.sub}</div>
    </div>`
  ).join('');
}

// ─── TABLE ────────────────────────────────────────────────────────────────────
function getFiltered() {
  const trades = getActiveTrades();
  const search = (document.getElementById('searchInput')?.value || '').toUpperCase().trim();
  return trades
    .filter(t => {
      if (currentFilter === 'Long')  return t.dir === 'Long';
      if (currentFilter === 'Short') return t.dir === 'Short';
      if (currentFilter === 'win')   return pnl(t) > 0;
      if (currentFilter === 'loss')  return pnl(t) <= 0;
      return true;
    })
    .filter(t => !search
      || t.sym.includes(search)
      || (t.note || '').toUpperCase().includes(search)
      || (t.tag  || '').toUpperCase().includes(search)
    )
    .sort((a, b) => {
      const k  = currentSort.key;
      const va = k === 'pnl' ? pnl(a) : a[k];
      const vb = k === 'pnl' ? pnl(b) : b[k];
      if (typeof va === 'string') return va.localeCompare(vb) * currentSort.dir;
      return (va - vb) * currentSort.dir;
    });
}

function renderTable() {
  const rows  = getFiltered();
  const tbody = document.getElementById('tradeBody');
  document.getElementById('emptyState').style.display = rows.length ? 'none' : 'block';

  tbody.innerHTML = rows.map((t, idx) => {
    const p = pnl(t), pp = pnlPct(t), win = p > 0;
    return `<tr class="row-enter ${win ? 'row-win' : 'row-loss'}" style="animation-delay:${idx * 0.03}s">
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${t.date}</td>
      <td style="font-weight:700;letter-spacing:1px;font-family:var(--mono)">${t.sym}</td>
      <td><span class="dir-tag ${t.dir === 'Long' ? 'long' : 'short'}">${t.dir === 'Long' ? '▲' : '▼'} ${t.dir.toUpperCase()}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${t.entry.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.exit.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.size}</td>
      <td><span class="pnl-cell ${win ? 'pos' : 'neg'}">${fmtNum(p)}</span></td>
      <td style="font-family:var(--mono);font-size:11px;color:${win ? 'var(--green)' : 'var(--red)'}">${(pp >= 0 ? '+' : '') + pp.toFixed(2)}%</td>
      <td style="color:var(--muted);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis">${t.note || '—'}</td>
      <td>${t.tag ? `<span class="tag-pill">${t.tag}</span>` : ''}</td>
      <td><button class="del-btn" onclick="delTrade(${t.id})" title="Delete">✕</button></td>
      <td>${t.tag ? `<span class="tag-pill">${t.tag}</span>` : ''}</td>
      <td style="display:flex; gap:8px;">
        <button class="del-btn" style="color:var(--blue)" onclick="editTrade(${t.id})" title="Edit">✏️</button>
        <button class="del-btn" onclick="delTrade(${t.id})" title="Delete">✕</button>
      </td>
    </tr>`;
  }).join('');
}

function setFilter(f, el) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderTable();
}

function sortBy(key) {
  currentSort = { key, dir: currentSort.key === key ? currentSort.dir * -1 : -1 };
  renderTable();
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function renderBreakdown() {
  const trades    = getActiveTrades();
  const wins      = trades.filter(t => pnl(t) > 0);
  const losses    = trades.filter(t => pnl(t) <= 0);
  const total     = trades.length || 1;
  const wPct      = (wins.length / total * 100).toFixed(0);
  const lPct      = (losses.length / total * 100).toFixed(0);
  const totalWin  = wins.reduce((s, t) => s + pnl(t), 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));
  document.getElementById('breakdown').innerHTML = `
    <div class="breakdown-bar">
      <div class="bar-row"><span class="bar-label">WIN</span><span style="color:var(--green)">${wins.length} (${wPct}%)</span></div>
      <div class="bar-track"><div class="bar-fill green" style="width:${wPct}%"></div></div>
      <div class="bar-row"><span class="bar-label">LOSS</span><span style="color:var(--red)">${losses.length} (${lPct}%)</span></div>
      <div class="bar-track"><div class="bar-fill red" style="width:${lPct}%"></div></div>
      <div class="bar-row" style="margin-top:4px"><span class="bar-label">GROSS PROFIT</span><span style="color:var(--green)">${fmtNum(totalWin)}</span></div>
      <div class="bar-row"><span class="bar-label">GROSS LOSS</span><span style="color:var(--red)">-${fmtAbs(totalLoss)}</span></div>
    </div>`;
}

function renderSymPerf() {
  const trades = getActiveTrades();
  const map = {};
  trades.forEach(t => { map[t.sym] = (map[t.sym] || 0) + pnl(t); });
  const sorted = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  document.getElementById('symPerf').innerHTML = sorted.length
    ? sorted.map(([sym, p]) =>
        `<div class="sym-row">
          <span class="sym-name">${sym}</span>
          <span class="sym-pnl ${p >= 0 ? 'pos' : 'neg'}">${fmtNum(p)}</span>
        </div>`).join('')
    : '<div style="padding:16px 20px;color:var(--muted);font-family:var(--mono);font-size:11px">No data yet</div>';
}

function renderStreak() {
  const trades = getActiveTrades();
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0, streakType = null, best = 0, bestType = null, cur = 0, curType = null;
  sorted.forEach(t => {
    const type = pnl(t) > 0 ? 'win' : 'loss';
    if (type === curType) { cur++; } else { curType = type; cur = 1; }
    if (cur > best) { best = cur; bestType = type; }
    streak = cur; streakType = type;
  });
  const dots = sorted.slice(-20).map(t =>
    `<div class="streak-dot ${pnl(t) > 0 ? 'w' : 'l'}" title="${t.sym} ${pnl(t) > 0 ? '+' : ''}${pnl(t).toFixed(0)}"></div>`
  ).join('');
  document.getElementById('streakBlock').innerHTML = `
    <div class="streak-block">
      <div class="streak-num ${streakType || ''}">${streak || 0}</div>
      <div class="streak-label">CURRENT ${streakType ? streakType.toUpperCase() + ' STREAK' : 'STREAK'}</div>
      <div class="streak-dots">${dots}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:12px">
        BEST: ${best} ${bestType ? bestType.toUpperCase() + 'S' : '—'}
      </div>
    </div>`;
}

function changeHeatmapMonth(offset) {
  heatmapDate.setMonth(heatmapDate.getMonth() + offset);
  renderHeatmap();
}

function renderHeatmap() {
  const pnlByDate = {};
  trades.forEach(t => {
    if (!pnlByDate[t.date]) pnlByDate[t.date] = 0;
    pnlByDate[t.date] += pnl(t);
  });

  // ใช้ heatmapDate แทน new Date()
  const year = heatmapDate.getFullYear();
  const month = heatmapDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const vals = Object.values(pnlByDate).filter(v => v !== 0);
  const maxAbs = vals.length ? Math.max(...vals.map(Math.abs)) : 1;

  let labelsHtml = ['S','M','T','W','T','F','S'].map(d =>
    `<div class="hmap-day-label">${d}</div>`
  ).join('');

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="hmap-cell" style="background:transparent"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const val = pnlByDate[dateStr] || 0;
    let bg;
    if (val === 0) {
      bg = 'rgba(255,255,255,0.04)';
    } else if (val > 0) {
      const alpha = Math.min(0.9, 0.15 + (val / maxAbs) * 0.75);
      bg = `rgba(60,255,160,${alpha.toFixed(2)})`;
    } else {
      const alpha = Math.min(0.9, 0.15 + (Math.abs(val) / maxAbs) * 0.75);
      bg = `rgba(255,69,96,${alpha.toFixed(2)})`;
    }
    const title = val !== 0 ? `${dateStr}: ${fmtNum(val)}` : dateStr;
    cells += `<div class="hmap-cell" style="background:${bg}" title="${title}"></div>`;
  }

  const monthLabel = heatmapDate.toLocaleString('en-US',{month:'long',year:'numeric'}).toUpperCase();

  // เพิ่มปุ่ม ◀ ▶ เข้าไปใน HTML
  document.getElementById('heatmap').innerHTML = `
    <div class="hmap-label">${labelsHtml}</div>
    <div class="heatmap-grid">${cells}</div>
    <div style="display:flex; justify-content:space-between; align-items:center; padding:0 20px 12px;">
      <button class="btn-ghost" style="padding:2px 8px; font-size:10px" onclick="changeHeatmapMonth(-1)">◀</button>
      <div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:1px">${monthLabel}</div>
      <button class="btn-ghost" style="padding:2px 8px; font-size:10px" onclick="changeHeatmapMonth(1)">▶</button>
    </div>
  `;
}

// ─── TRADE MODAL ──────────────────────────────────────────────────────────────
function openModal() {
  editingId = null; 
  document.querySelector('.modal-title').textContent = "NEW TRADE ENTRY";
  document.querySelector('.modal-footer .btn-accent').textContent = "SAVE TRADE ▸";
  
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  
  // เคลียร์ฟอร์ม
  ['f-sym','f-entry','f-exit','f-size','f-note','f-account'].forEach(id => {
    document.getElementById(id).value = '';
  });
  
  selectedTag = '';
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
  setDir('Long');
  updatePreview();
}

function editTrade(id) {
  const t = trades.find(x => x.id === id);
  if(!t) return;
  
  editingId = id; // เซ็ตว่ากำลังแก้ ID นี้นะ
  
  // เปลี่ยนหน้าตา Modal
  document.querySelector('.modal-title').textContent = "EDIT TRADE";
  document.querySelector('.modal-footer .btn-accent').textContent = "SAVE CHANGES ▸";
  document.getElementById('modalOverlay').classList.add('open');

  // ดึงข้อมูลเดิมมาใส่ฟอร์ม
  document.getElementById('f-sym').value = t.sym;
  document.getElementById('f-date').value = t.date;
  document.getElementById('f-entry').value = t.entry;
  document.getElementById('f-exit').value = t.exit;
  document.getElementById('f-size').value = t.size;
  document.getElementById('f-account').value = t.account || '';
  document.getElementById('f-note').value = t.note || '';

  setDir(t.dir);
  
  selectedTag = t.tag || '';
  document.querySelectorAll('.tag-btn').forEach(b => {
    if(b.textContent.trim().toUpperCase() === selectedTag.toUpperCase()) b.classList.add('selected');
    else b.classList.remove('selected');
  });

  updatePreview();
}

function closeModal(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModalDirect();
}
function closeModalDirect() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function setDir(dir) {
  selectedDir = dir;
  document.getElementById('btn-long').className  = 'dir-btn' + (dir === 'Long'  ? ' active' : '');
  document.getElementById('btn-short').className = 'dir-btn' + (dir === 'Short' ? ' active' : '');
  updatePreview();
}

function toggleTag(el, tag) {
  if (selectedTag === tag) {
    selectedTag = ''; el.classList.remove('selected');
  } else {
    selectedTag = tag;
    document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
  }
}

function updatePreview() {
  const entry = parseFloat(document.getElementById('f-entry')?.value);
  const exit  = parseFloat(document.getElementById('f-exit')?.value);
  const size  = parseFloat(document.getElementById('f-size')?.value);
  const pv = document.getElementById('previewVal');
  const pr = document.getElementById('previewRR');
  if (!isNaN(entry) && !isNaN(exit) && !isNaN(size) && size > 0) {
    const diff = selectedDir === 'Long' ? exit - entry : entry - exit;
    const p = diff * size;
    pv.textContent = fmtNum(p);
    pv.className   = 'preview-val ' + (p >= 0 ? 'pos' : 'neg');
    const pct = entry ? (diff / entry * 100).toFixed(2) : '0.00';
    pr.textContent = `${pct}% per unit · size ${size}`;
  } else {
    pv.textContent = '—'; pv.className = 'preview-val'; pr.textContent = '';
  }
}

['f-entry','f-exit','f-size'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updatePreview);
});

function saveTrade() {
  const portfolio = getActivePortfolio();
  if (!portfolio) { toast('ไม่มีพอร์ต — สร้างพอร์ตก่อน', 'error'); return; }
  const sym     = (document.getElementById('f-sym').value || '').trim().toUpperCase();
  const date    = document.getElementById('f-date').value;
  const entry   = parseFloat(document.getElementById('f-entry').value);
  const exit    = parseFloat(document.getElementById('f-exit').value);
  const size    = parseFloat(document.getElementById('f-size').value);
  const note    = document.getElementById('f-note').value.trim();
  const account = parseFloat(document.getElementById('f-account').value) || 0;

  if (!sym || !date || isNaN(entry) || isNaN(exit) || isNaN(size)) {
    toast('Fill in all required fields', 'error'); return;
  }

  // เช็คว่าเป็นการแก้ไข หรือ เพิ่มใหม่
  if (editingId !== null) {
    const idx = trades.findIndex(t => t.id === editingId);
    if(idx > -1) {
      trades[idx] = { ...trades[idx], date, sym, dir: selectedDir, entry, exit, size, note, tag: selectedTag, account };
    }
    toast('Trade updated ✓');
  } else {
    trades.push({ id: nextId++, date, sym, dir: selectedDir, entry, exit, size, note, tag: selectedTag, account });
    toast('Trade saved ✓');
  }
  
  save(); render();
  closeModalDirect();
}

function delTrade(id) {
  if (!confirm('ลบ trade นี้?')) return;
  const p = getActivePortfolio();
  if (!p) return;
  p.trades = p.trades.filter(t => t.id !== id);
  save(); render();
  toast('Trade deleted', 'error');
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportCSV() {
  const trades  = getActiveTrades();
  const portfolio = getActivePortfolio();
  const header  = 'Date,Symbol,Direction,Entry,Exit,Size,PnL,PnL%,Setup,Tag';
  const rows    = trades.map(t => {
    const p = pnl(t), pp = pnlPct(t);
    return [t.date, t.sym, t.dir, t.entry, t.exit, t.size,
      p.toFixed(2), pp.toFixed(2) + '%', `"${(t.note||'').replace(/"/g,'""')}"`, t.tag || ''
    ].join(',');
  });
  const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${portfolio?.name || 'tradelog'}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exported ↓');
}

function exportNotion() {
  const trades = getActiveTrades();
  const header = 'Date\tSymbol\tDirection\tEntry\tExit\tSize\tP&L\tP&L%\tResult\tSetup\tTag';
  const rows   = trades.map(t => {
    const p = pnl(t), pp = pnlPct(t);
    return [t.date, t.sym, t.dir, t.entry, t.exit, t.size,
      (p >= 0 ? '+' : '') + p.toFixed(2),
      (pp >= 0 ? '+' : '') + pp.toFixed(2) + '%',
      p > 0 ? 'Win' : 'Loss', t.note || '', t.tag || ''
    ].join('\t');
  });
  document.getElementById('notionText').value = header + '\n' + rows.join('\n');
  document.getElementById('notionOverlay').classList.add('open');
}

function closeNotion(e) {
  if (e.target === document.getElementById('notionOverlay'))
    document.getElementById('notionOverlay').classList.remove('open');
}

function copyNotion() {
  const text = document.getElementById('notionText').value;
  navigator.clipboard.writeText(text).then(() => {
    const msg = document.getElementById('copiedMsg');
    if (msg) { msg.style.opacity = 1; setTimeout(() => msg.style.opacity = 0, 2000); }
    toast('Copied to clipboard ✓');
  }).catch(() => toast('Copy failed — select all and copy manually', 'error'));
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModalDirect();
    document.getElementById('notionOverlay')?.classList.remove('open');
    document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
    document.getElementById('portfolioSettingsOverlay')?.classList.remove('open');
    document.getElementById('newPortfolioOverlay')?.classList.remove('open');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault(); openModal();
  }
});

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function render() {
  drawEquity();
  renderMetrics();
  renderTable();
  renderBreakdown();
  renderSymPerf();
  renderStreak();
  renderHeatmap();
}

document.addEventListener('DOMContentLoaded', () => {
  checkFirstTime();
  renderPortfolioTabs();
  render();
});
