// ─── STATE ───────────────────────────────────────────────────────────────────
let trades = [];

try {
  const saved = JSON.parse(localStorage.getItem('tradelog_v2'));
  if (Array.isArray(saved)) {
    trades = saved;
  }
} catch (e) {
  trades = [];
}

let nextId = trades.length ? Math.max(...trades.map(t => t.id)) + 1 : 1;
let currentFilter = 'all';
let currentSort = { key: 'date', dir: -1 };
let selectedDir = 'Long';
let selectedTag = '';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function save() { localStorage.setItem('tradelog_v2', JSON.stringify(trades)); }

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

// ─── CURSOR ──────────────────────────────────────────────────────────────────
const dot  = document.querySelector('.cursor-dot');
const ring = document.querySelector('.cursor-ring');
let mx = 0, my = 0, rx = 0, ry = 0;

document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

function animateCursor() {
    rx += (mx - rx) * 0.12;
    ry += (my - ry) * 0.12;
    if (dot)  dot.style.cssText  += `left:${mx}px;top:${my}px;`;
    if (ring) ring.style.cssText += `left:${rx}px;top:${ry}px;`;
    requestAnimationFrame(animateCursor);
}
/* Pause Function*/ 
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(animateCursor);
  else animateCursor();
});

animateCursor();

// ─── LIVE TIME ────────────────────────────────────────────────────────────────
function updateTime() {
  document.getElementById('liveTime').textContent =
    new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateTime, 1000);
updateTime();

// ─── GECKO TIKER TAPE ────────────────────────────────────────────────────────────────
// CoinGecko ID map  (symbol → id ที่ API ต้องการ)
const COIN_IDS = {
  BTC:   'bitcoin',         ETH:   'ethereum',       SOL:   'solana',
  BNB:   'binancecoin',     XRP:   'ripple',          ADA:   'cardano',
  AVAX:  'avalanche-2',     DOT:   'polkadot',        LINK:  'chainlink',
  MATIC: 'matic-network',   DOGE:  'dogecoin',        TON:   'the-open-network',
  SUI:   'sui',             APT:   'aptos',           OP:    'optimism',
  ARB:   'arbitrum',        ATOM:  'cosmos',          LTC:   'litecoin',
  UNI:   'uniswap',         PEPE:  'pepe',
};

// coins ที่เปิดใช้งาน — โหลดจาก localStorage หรือ default
let selectedCoins = JSON.parse(localStorage.getItem('ticker_coins') || 'null')
  || ['BTC','ETH','SOL','BNB','XRP','ADA','AVAX','LINK'];

let tickerPriceCache = {}; // เก็บราคาล่าสุดไว้ใช้ตอน rebuild
let tickerInterval = null;

// ── STEP 1: fetch ราคาจาก CoinGecko ──────────────────────────────────────────
// รับ array ของ symbols เช่น ['BTC','ETH','SOL']
// ส่งคืน object: { BTC: { price: 94200, chg: 2.4 }, ... }
async function fetchCoinPrices(symbols) {
  // แปลง symbols → CoinGecko IDs  (กรอง coin ที่ไม่มีใน map ออก)
  const ids = symbols.map(s => COIN_IDS[s]).filter(Boolean).join(',');
  if (!ids) return {};

  // เรียก CoinGecko Simple Price endpoint
  // include_24hr_change=true  → ได้ % เปลี่ยนแปลง 24h มาด้วย
  const url = `https://api.coingecko.com/api/v3/simple/price`
            + `?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

  const res  = await fetch(url);
  if (!res.ok) throw new Error('CoinGecko API error: ' + res.status);
  const data = await res.json();

  // แปลงกลับเป็น symbol-keyed object ให้ง่ายต่อการใช้งาน
  const result = {};
  symbols.forEach(sym => {
    const id = COIN_IDS[sym];
    if (data[id]) {
      result[sym] = {
        price: data[id].usd,
        chg:   +(data[id].usd_24h_change || 0).toFixed(2),
      };
    }
  });
  return result;
}

// ── STEP 2: สร้าง HTML ของ ticker จากข้อมูลจริง ──────────────────────────────
function buildTicker(priceData) {
  // ถ้ายังไม่มีข้อมูล (กำลัง load) แสดง skeleton
  if (!priceData || Object.keys(priceData).length === 0) {
    document.getElementById('ticker').innerHTML =
      '<span class="ticker-item" style="opacity:0.5;letter-spacing:2px">LOADING LIVE PRICES...</span>';
    return;
  }

  // สร้าง items เฉพาะ coin ที่ fetch สำเร็จ
  const items = selectedCoins
    .filter(s => priceData[s])
    .map(s => ({ sym: s, ...priceData[s] }));

  // ทำซ้ำ 2 รอบเพื่อให้ ticker วนต่อเนื่องไม่สะดุด
  const html = [...items, ...items].map(i => {
    const priceStr = i.price >= 1
      ? i.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : i.price.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
    return `<span class="ticker-item">
      <span class="sym">${i.sym}</span>
      <span>$${priceStr}</span>
      <span class="chg ${i.chg >= 0 ? 'pos' : 'neg'}">${i.chg >= 0 ? '▲' : '▼'} ${Math.abs(i.chg)}%</span>
    </span><span class="ticker-sep">◆</span>`;
  }).join('');

  document.getElementById('ticker').innerHTML = html;
}

// ── STEP 3: refresh — fetch แล้ว rebuild ticker ──────────────────────────────
async function refreshTicker() {
  // อัปเดต status dot บน ticker
  const statusDot = document.getElementById('tickerStatus');
  if (statusDot) { statusDot.style.opacity = '0.4'; }

  try {
    tickerPriceCache = await fetchCoinPrices(selectedCoins);
    buildTicker(tickerPriceCache);
    if (statusDot) { statusDot.style.opacity = '1'; statusDot.style.background = '#3cffa0'; }
    document.getElementById('lastUpdate').textContent =
      'LIVE · ' + new Date().toLocaleTimeString('en-US', { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
  } catch (err) {
    console.warn('Ticker fetch failed:', err);
    // fallback — ถ้า API ล้มเหลวให้แสดงข้อมูล cache เดิม
    if (Object.keys(tickerPriceCache).length) buildTicker(tickerPriceCache);
    if (statusDot) { statusDot.style.background = '#ff4560'; statusDot.style.opacity = '1'; }
  }
}

// ── STEP 4: ตั้ง interval fetch ทุก 60 วิ ────────────────────────────────────
function startTickerRefresh() {
  if (tickerInterval) clearInterval(tickerInterval);
  refreshTicker();                          // fetch ทันทีตอนโหลด
  tickerInterval = setInterval(refreshTicker, 60000); // แล้ว fetch ซ้ำทุก 60 วิ
}

// ── SETTINGS PANEL ───────────────────────────────────────────────────────────
function openTickerSettings() {
  document.getElementById('tickerSettingsOverlay').classList.add('open');
  // sync status dot + last update time into modal
  const modalDot = document.getElementById('tickerModalStatus');
  const mainDot  = document.getElementById('tickerStatus');
  if (modalDot && mainDot) modalDot.style.background = mainDot.style.background || '#3cffa0';
  const lu = document.getElementById('lastUpdate');
  const mt = document.getElementById('tickerModalTime');
  if (lu && mt) mt.textContent = lu.textContent;
  renderCoinPicker();
}

function closeTickerSettings(e) {
  if (!e || e.target === document.getElementById('tickerSettingsOverlay'))
    document.getElementById('tickerSettingsOverlay').classList.remove('open');
}

function renderCoinPicker() {
  const allCoins = Object.keys(COIN_IDS);
  document.getElementById('coinPickerGrid').innerHTML = allCoins.map(sym => {
    const active = selectedCoins.includes(sym);
    return `<button class="coin-pick-btn ${active ? 'active' : ''}" onclick="toggleCoin('${sym}',this)">
      ${sym}
    </button>`;
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
  document.getElementById('selectedCount').textContent = selectedCoins.length + ' selected';
}

function applyTickerSettings() {
  localStorage.setItem('ticker_coins', JSON.stringify(selectedCoins));
  closeTickerSettings();
  buildTicker({}); // แสดง loading
  startTickerRefresh();
  toast('Ticker updated — fetching live prices ✓');
}

// ── RATE-LIMIT-PROTECTION TICKER ───────────────────────────────────────────────────────────
async function fetchCoinPrices(symbols) {
  try {
    const ids = symbols.map(s => COIN_IDS[s]).filter(Boolean).join(',');
    if (!ids) return {};

    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);

    if (!res.ok) throw new Error();

    const data = await res.json();

    const result = {};
    symbols.forEach(sym => {
      const id = COIN_IDS[sym];
      if (data[id]) {
        result[sym] = {
          price: data[id].usd,
          chg: +(data[id].usd_24h_change || 0).toFixed(2),
        };
      }
    });

    return result;

  } catch {
    await new Promise(r => setTimeout(r, 1500)); // retry delay
    return tickerPriceCache; // fallback
  }
}

// kick off!
startTickerRefresh();

// ─── FLASH TICKER─────────────────────────────────────────────────────────────
function flashTicker() {
  const el = document.querySelector('.ticker-wrap');
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 150);
}

flashTicker();

// ─── THEME BUTTON ─────────────────────────────────────────────────────────────
const toggle = document.getElementById("themeToggle");

toggle.addEventListener("click", () => {
  document.documentElement.classList.toggle("light");

  localStorage.setItem(
    "theme",
    document.documentElement.classList.contains("light")
      ? "light"
      : "dark"
  );
});

// load saved theme
if (localStorage.getItem("theme") === "light") {
  document.documentElement.classList.add("light");
}

if (!localStorage.getItem("theme")) {
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  if (prefersLight) {
    document.documentElement.classList.add("light");
  }
}

// ─── EQUITY CURVE ─────────────────────────────────────────────────────────────
function drawEquity() {
  const canvas = document.getElementById('equityCanvas');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth;
  canvas.width  = W * dpr;
  canvas.height = 120 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return;

  const points = [0];
  let running = 0;
  sorted.forEach(t => { running += pnl(t); points.push(running); });

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pad = 10;

  const xs = (i) => (i / (points.length - 1)) * (W - pad * 2) + pad;
  const ys = (v) => 100 - ((v - min) / range) * 80 + 10;

  // Fill gradient
  const grad = ctx.createLinearGradient(0, 0, 0, 120);
  const isPos = running >= 0;
  if (isPos) {
    grad.addColorStop(0, 'rgba(60,255,160,0.25)');
    grad.addColorStop(1, 'rgba(60,255,160,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,69,96,0.25)');
    grad.addColorStop(1, 'rgba(255,69,96,0)');
  }

  ctx.beginPath();
  ctx.moveTo(xs(0), ys(points[0]));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(xs(i), ys(p)); });
  ctx.lineTo(xs(points.length - 1), 120);
  ctx.lineTo(xs(0), 120);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(xs(0), ys(points[0]));
  points.forEach((p, i) => { if (i > 0) ctx.lineTo(xs(i), ys(p)); });
  ctx.strokeStyle = isPos ? '#3cffa0' : '#ff4560';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Zero line
  const zeroY = ys(0);
  ctx.beginPath();
  ctx.moveTo(pad, zeroY);
  ctx.lineTo(W - pad, zeroY);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Dots at each trade
  points.forEach((p, i) => {
    const win = i > 0 && pnl(sorted[i - 1]) > 0;
    ctx.beginPath();
    ctx.arc(xs(i), ys(p), 4, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.3)' : (win ? '#3cffa0' : '#ff4560');
    ctx.fill();
  });

  // Stats
  const totalPnl = running;
  const wins = trades.filter(t => pnl(t) > 0);
  const wr = trades.length ? (wins.length / trades.length * 100).toFixed(1) : 0;
  const maxDD = calcMaxDrawdown(points);

  document.getElementById('equityStats').innerHTML = `
    <div class="equity-stat">
      <div class="el">TOTAL P&L</div>
      <div class="ev ${totalPnl >= 0 ? 'pos' : 'neg'}">${fmtNum(totalPnl)}</div>
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
    </div>
  `;
}

function calcMaxDrawdown(points) {
  let peak = points[0], maxDD = 0;
  points.forEach(p => {
    if (p > peak) peak = p;
    const dd = peak - p;
    if (dd > maxDD) maxDD = dd;
  });
  return maxDD;
}

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

  const metrics = [
    { label: 'TOTAL P&L',     val: fmtNum(totalPnl),        cls: totalPnl >= 0 ? 'pos' : 'neg', sub: 'USD' },
    { label: 'WIN RATE',      val: winRate.toFixed(1) + '%', cls: winRate >= 50 ? 'pos' : 'neg', sub: `${wins.length}W / ${losses.length}L` },
    { label: 'AVG WIN',       val: fmtNum(avgWin),           cls: 'pos', sub: 'per trade' },
    { label: 'AVG LOSS',      val: '-' + fmtAbs(avgLoss),    cls: 'neg', sub: 'per trade' },
    { label: 'R:R RATIO',     val: rr ? rr.toFixed(2) : '—', cls: rr >= 1 ? 'pos' : 'neg', sub: 'avg win / avg loss' },
    { label: 'PROFIT FACTOR', val: profitFactor ? profitFactor.toFixed(2) : '—', cls: profitFactor >= 1 ? 'accent' : 'neg', sub: 'gross profit / loss' },
    { label: 'TOTAL TRADES',  val: trades.length,             cls: '',    sub: 'logged' },
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
  const search = (document.getElementById('searchInput')?.value || '').toUpperCase();
  return trades
    .filter(t => {
      if (currentFilter === 'Long')  return t.dir === 'Long';
      if (currentFilter === 'Short') return t.dir === 'Short';
      if (currentFilter === 'win')   return pnl(t) > 0;
      if (currentFilter === 'loss')  return pnl(t) <= 0;
      return true;
    })
    .filter(t => !search || t.sym.includes(search) || (t.note || '').toUpperCase().includes(search) || (t.tag || '').toUpperCase().includes(search))
    .sort((a, b) => {
      const k = currentSort.key;
      let va = k === 'pnl' ? pnl(a) : a[k];
      let vb = k === 'pnl' ? pnl(b) : b[k];
      if (typeof va === 'string') return va.localeCompare(vb) * currentSort.dir;
      return (va - vb) * currentSort.dir;
    });
}

function renderTable() {
  const rows = getFiltered();
  const tbody = document.getElementById('tradeBody');
  document.getElementById('emptyState').style.display = rows.length ? 'none' : 'block';

  tbody.innerHTML = rows.map((t, idx) => {
    const p = pnl(t);
    const pp = pnlPct(t);
    const win = p > 0;
    return `<tr class="row-enter ${win ? 'row-win' : 'row-loss'}" style="animation-delay:${idx * 0.03}s">
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${t.date}</td>
      <td style="font-weight:700;letter-spacing:1px;font-family:var(--mono)">${t.sym}</td>
      <td><span class="dir-tag ${t.dir === 'Long' ? 'long' : 'short'}">${t.dir === 'Long' ? '▲' : '▼'} ${t.dir.toUpperCase()}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${t.entry.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.exit.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.size}</td>
      <td><span class="pnl-cell ${win ? 'pos' : 'neg'}">${fmtNum(p)}</span></td>
      <td style="font-family:var(--mono);font-size:11px;color:${win ? 'var(--green)' : 'var(--red)'}">${pp >= 0 ? '+' : ''}${pp.toFixed(2)}%</td>
      <td style="color:var(--muted);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis">${t.note || '—'}</td>
      <td>${t.tag ? `<span class="tag-pill">${t.tag}</span>` : ''}</td>
      <td><button class="del-btn" onclick="delTrade(${t.id})" title="Delete">✕</button></td>
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
  if (currentSort.key === key) currentSort.dir *= -1;
  else { currentSort.key = key; currentSort.dir = -1; }
  renderTable();
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function renderBreakdown() {
  const wins = trades.filter(t => pnl(t) > 0);
  const losses = trades.filter(t => pnl(t) <= 0);
  const total = trades.length || 1;
  const wPct = (wins.length / total * 100).toFixed(0);
  const lPct = (losses.length / total * 100).toFixed(0);
  const totalWin = wins.reduce((s, t) => s + pnl(t), 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));

  document.getElementById('breakdown').innerHTML = `
    <div class="breakdown-bar">
      <div class="bar-row"><span class="bar-label">WIN</span><span style="color:var(--green)">${wins.length} (${wPct}%)</span></div>
      <div class="bar-track"><div class="bar-fill green" style="width:${wPct}%"></div></div>
      <div class="bar-row"><span class="bar-label">LOSS</span><span style="color:var(--red)">${losses.length} (${lPct}%)</span></div>
      <div class="bar-track"><div class="bar-fill red" style="width:${lPct}%"></div></div>
      <div class="bar-row" style="margin-top:4px"><span class="bar-label">GROSS PROFIT</span><span style="color:var(--green)">${fmtNum(totalWin)}</span></div>
      <div class="bar-row"><span class="bar-label">GROSS LOSS</span><span style="color:var(--red)">-${fmtAbs(totalLoss)}</span></div>
    </div>
  `;
}

function renderSymPerf() {
  const map = {};
  trades.forEach(t => {
    if (!map[t.sym]) map[t.sym] = 0;
    map[t.sym] += pnl(t);
  });
  const sorted = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  document.getElementById('symPerf').innerHTML = sorted.map(([sym, p]) =>
    `<div class="sym-row">
      <span class="sym-name">${sym}</span>
      <span class="sym-pnl ${p >= 0 ? 'pos' : 'neg'}">${fmtNum(p)}</span>
    </div>`
  ).join('');
}

function renderStreak() {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0, streakType = null, best = 0, bestType = null, cur = 0, curType = null;
  sorted.forEach(t => {
    const win = pnl(t) > 0;
    const type = win ? 'win' : 'loss';
    if (type === curType) {
      cur++;
    } else {
      curType = type; cur = 1;
    }
    if (cur > best) { best = cur; bestType = type; }
    streak = cur; streakType = type;
  });

  const dots = sorted.slice(-20).map(t => {
    const win = pnl(t) > 0;
    return `<div class="streak-dot ${win ? 'w' : 'l'}"></div>`;
  }).join('');

  document.getElementById('streakBlock').innerHTML = `
    <div class="streak-block">
      <div class="streak-num ${streakType || ''}">${streak || 0}</div>
      <div class="streak-label">CURRENT ${streakType ? streakType.toUpperCase() + ' STREAK' : 'STREAK'}</div>
      <div class="streak-dots">${dots}</div>
      <div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:12px">BEST: ${best} ${bestType ? bestType.toUpperCase() + 'S' : '—'}</div>
    </div>
  `;
}

function renderHeatmap() {
  const pnlByDate = {};
  trades.forEach(t => {
    if (!pnlByDate[t.date]) pnlByDate[t.date] = 0;
    pnlByDate[t.date] += pnl(t);
  });

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
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

  document.getElementById('heatmap').innerHTML = `
    <div class="hmap-label">${labelsHtml}</div>
    <div class="heatmap-grid">${cells}</div>
    <div style="padding:0 20px 12px;font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:1px">${today.toLocaleString('en-US',{month:'long',year:'numeric'}).toUpperCase()}</div>
  `;
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal() {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  selectedTag = '';
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
  setDir('Long');
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
  document.getElementById('btn-long').className  = 'dir-btn' + (dir === 'Long' ? ' active' : '');
  document.getElementById('btn-short').className = 'dir-btn' + (dir === 'Short' ? ' active' : '');
  updatePreview();
}

function toggleTag(el, tag) {
  if (selectedTag === tag) {
    selectedTag = '';
    el.classList.remove('selected');
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
  if (!isNaN(entry) && !isNaN(exit) && !isNaN(size)) {
    const diff = selectedDir === 'Long' ? exit - entry : entry - exit;
    const p = diff * size;
    pv.textContent = fmtNum(p);
    pv.className = 'preview-val ' + (p >= 0 ? 'pos' : 'neg');
    const pct = entry ? (diff / entry * 100).toFixed(2) : 0;
    pr.textContent = `${pct}% per unit · ${size}x`;
  } else {
    pv.textContent = '—'; pv.className = 'preview-val';
    pr.textContent = '';
  }
}

// Listen for live preview
['f-entry', 'f-exit', 'f-size'].forEach(id => {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updatePreview);
  }, 100);
});

function saveTrade() {
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
  trades.push({ id: nextId++, date, sym, dir: selectedDir, entry, exit, size, note, tag: selectedTag, account });
  save(); render();
  closeModalDirect();
  ['f-sym','f-entry','f-exit','f-size','f-note','f-account'].forEach(id => {
    document.getElementById(id).value = '';
  });
  toast('Trade saved ✓');
}

function delTrade(id) {
  if (!confirm('Delete this trade?')) return;
  trades = trades.filter(t => t.id !== id);
  save(); render();
  toast('Trade deleted', 'error');
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportCSV() {
  const header = 'Date,Symbol,Direction,Entry,Exit,Size,PnL,PnL%,Setup,Tag';
  const rows = trades.map(t => {
    const p = pnl(t);
    const pp = pnlPct(t);
    return [t.date, t.sym, t.dir, t.entry, t.exit, t.size, p.toFixed(2), pp.toFixed(2) + '%', `"${t.note || ''}"`, t.tag || ''].join(',');
  });
  const csv = header + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `tradelog_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
  toast('CSV exported ↓');
}

function exportNotion() {
  const header = 'Date\tSymbol\tDirection\tEntry\tExit\tSize\tP&L\tP&L%\tResult\tSetup\tTag';
  const rows = trades.map(t => {
    const p = pnl(t);
    const pp = pnlPct(t);
    return [t.date, t.sym, t.dir, t.entry, t.exit, t.size,
      (p >= 0 ? '+' : '') + p.toFixed(2),
      (pp >= 0 ? '+' : '') + pp.toFixed(2) + '%',
      p > 0 ? 'Win' : 'Loss',
      t.note || '', t.tag || ''
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
  navigator.clipboard.writeText(document.getElementById('notionText').value).then(() => {
    const msg = document.getElementById('copiedMsg');
    msg.style.opacity = 1;
    setTimeout(() => msg.style.opacity = 0, 2000);
    toast('Copied to clipboard ✓');
  });
}

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

window.addEventListener('DOMContentLoaded', () => {
  render();
});
