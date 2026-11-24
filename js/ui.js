// ─── APP LISTENERS (called once after #appWrapper is visible) ─────────────────
let appListenersReady = false;
function initAppListeners() {
  if (appListenersReady) return;
  appListenersReady = true;

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('light');
      localStorage.setItem('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
      setTimeout(() => {
        drawEquity();
        renderHeatmap();
      }, 50);
    });
  }

  document.getElementById('searchInput')?.addEventListener('input', () => { currentPage = 1; renderTable(); });

  ['f-entry','f-exit','f-size','f-mult','f-sl','f-tp'].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener('input', updatePreview);
  });

  initEquityHover();
}

// ─── GLOBAL KEYBOARD SHORTCUTS ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAllExpandedCards();
    closeModalDirect();
    closeImportModalDirect();
    document.getElementById('notionOverlay')?.classList.remove('open');
    document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
    document.getElementById('portfolioSettingsOverlay')?.classList.remove('open');
    document.getElementById('newPortfolioOverlay')?.classList.remove('open');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openModal(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const s = document.getElementById('searchInput');
    if (s) { s.focus(); s.select(); }
  }
});

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function render() {
  drawEquity();
  renderMetrics();
  renderTable();
  renderRecentFeed();
  renderBreakdown();
  renderSymPerf();
  renderStreak();
  renderHeatmap();
}

// ─── EQUITY CURVE ─────────────────────────────────────────────────────────────
function drawEquity() {
  const trades = getDateFilteredTrades(), canvas = document.getElementById('equityCanvas'); if (!canvas) return;
  const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth; if (W === 0) return;
  resetEquityHover(); equityPoints = []; equityBase = null;   // data is about to change
  // Bitmap = displayed size × DPR on BOTH axes. The canvas is 160 CSS px tall but the chart is laid out in a
  // 120-unit space; sizing the bitmap 120 tall and letting CSS stretch it 1.33× is what made it soft on Retina.
  const cssH = canvas.offsetHeight || 120, sy = cssH / 120;
  canvas.width = W * dpr; canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr * sy);
  const isLight = document.documentElement.classList.contains('light');
  const sorted  = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    document.getElementById('equityStats').innerHTML =
      `<div class="equity-stat"><div class="el">TOTAL P&L</div><div class="ev">+0.00</div></div>` +
      `<div class="equity-stat"><div class="el">WIN RATE</div><div class="ev">0%</div></div>` +
      `<div class="equity-stat"><div class="el">MAX DRAWDOWN</div><div class="ev neg">0.00</div></div>` +
      `<div class="equity-stat"><div class="el">TRADES</div><div class="ev">0</div></div>`;
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
    ctx.fillStyle = i === 0
      ? (isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)')
      : (win ? lineColor : (isLight ? '#dc2626' : '#ff4560'));
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '10px "Space Mono"'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(fmtNum(max, 0), W - pad, ys(max) + (max === points[points.length - 1] ? -10 : 10));
  if (min !== max) ctx.fillText(fmtNum(min, 0), W - pad, ys(min) - 10);
  if (min < 0 && max > 0) ctx.fillText('0', W - pad, ys(0) - 6);

  // geometry + snapshot of the finished chart, used by the hover overlay
  const balMap = buildBalanceMap();
  equityPoints = sorted.map((t, i) => ({
    x: xs(i + 1), y: ys(points[i + 1]), trade: t, equity: balMap[t.id],
    color: pnl(t) > 0 ? lineColor : (isLight ? '#dc2626' : '#ff4560'),
  }));
  equityGeom = { dpr, W, H: 120, sy, isLight };
  try { equityBase = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { equityBase = null; }

  let peak = points[0], maxDD = 0;
  points.forEach(p => { if (p > peak) peak = p; const dd = peak - p; if (dd > maxDD) maxDD = dd; });
  const wins = trades.filter(t => pnl(t) > 0), wr = trades.length ? (wins.length / trades.length * 100) : 0;
  document.getElementById('equityStats').innerHTML =
    `<div class="equity-stat"><div class="el">TOTAL P&L</div><div class="ev ${running >= 0 ? 'pos' : 'neg'}">${fmtNum(running)}</div></div>` +
    `<div class="equity-stat"><div class="el">WIN RATE</div><div class="ev ${wr >= 50 ? 'pos' : 'neg'}">${wr.toFixed(1)}%</div></div>` +
    `<div class="equity-stat"><div class="el">MAX DRAWDOWN</div><div class="ev neg">${fmtNum(-Math.abs(maxDD))}</div></div>` +
    `<div class="equity-stat"><div class="el">TRADES</div><div class="ev">${trades.length}</div></div>`;

  // Update Hero Balance Card
  const port = getActivePortfolio();
  const allActiveTrades = getActiveTrades();
  const allTotalPnl = allActiveTrades.reduce((s, t) => s + pnl(t), 0);
  const curBal = (port?.balance || 0) + allTotalPnl;
  const portRet = port && port.balance ? (allTotalPnl / port.balance * 100) : 0;

  const heroBalEl = document.getElementById('heroBalanceDisplay');
  if (heroBalEl) heroBalEl.textContent = `$${fmtAbs(curBal, 2)}`;

  const heroRetEl = document.getElementById('heroReturnBadge');
  if (heroRetEl) {
    heroRetEl.textContent = `${portRet >= 0 ? '+' : ''}${portRet.toFixed(2)}%`;
    heroRetEl.className = `hero-return-badge ${portRet >= 0 ? 'pos' : 'neg'}`;
  }
}
// Redraw when the chart's box changes size (window resize, sidebar/layout shift, rotation) or the device
// pixel ratio changes (browser zoom, dragging the window to another monitor). One observer, created once.
let equityResizeReady = false, equityResizeObserver = null, equityResizeRaf = 0;
function initEquityResize() {
  if (equityResizeReady) return;            // idempotent on BOTH paths (observer and window-resize fallback)
  equityResizeReady = true;
  const wrap = document.querySelector('.equity-canvas-wrap');
  if (wrap && window.ResizeObserver) {
    equityResizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(equityResizeRaf);                         // coalesce bursts into one frame
      equityResizeRaf = requestAnimationFrame(() => drawEquity());
    });
    equityResizeObserver.observe(wrap);
  } else {
    window.addEventListener('resize', () => drawEquity());           // browsers without ResizeObserver
  }
  watchDevicePixelRatio();
}
function watchDevicePixelRatio() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  // { once } + re-arm with the new ratio: exactly one live listener at any time
  mq.addEventListener?.('change', () => { drawEquity(); watchDevicePixelRatio(); }, { once: true });
}
initEquityResize();

// ─── EQUITY HOVER: crosshair · pulsing ring · tooltip ─────────────────────────
let equityPoints = [], equityGeom = null, equityBase = null, equityHover = -1, equityRaf = 0;
const EQUITY_HIT_RADIUS = 25;   // px

function equityReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// state + tooltip reset only (no repaint) — used when the chart itself is being redrawn
function resetEquityHover() {
  if (equityRaf) { cancelAnimationFrame(equityRaf); equityRaf = 0; }
  equityHover = -1;
  const tip = document.getElementById('equityTooltip'); if (tip) tip.style.display = 'none';
}
// reset + put the clean chart back on the canvas
function clearEquityHover() {
  const had = equityHover >= 0;
  resetEquityHover();
  const canvas = document.getElementById('equityCanvas');
  if (had && canvas && equityBase && equityGeom) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(equityBase, 0, 0);
    ctx.setTransform(equityGeom.dpr, 0, 0, equityGeom.dpr * equityGeom.sy, 0, 0);
  }
}

function paintEquityOverlay(ts) {
  const canvas = document.getElementById('equityCanvas'), g = equityGeom, p = equityPoints[equityHover];
  if (!canvas || !g || !p || !equityBase) return;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(equityBase, 0, 0);
  ctx.setTransform(g.dpr, 0, 0, g.dpr * g.sy, 0, 0);

  // vertical crosshair
  ctx.beginPath(); ctx.moveTo(p.x, 4); ctx.lineTo(p.x, g.H - 4);
  ctx.strokeStyle = g.isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);

  // pulsing ring — canvas is CSS-stretched vertically, so undo that to keep it circular
  const sy = g.sy;
  const phase = equityReducedMotion() ? 0.3 : ((ts || 0) % 1200) / 1200;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 1 / sy);
  ctx.beginPath(); ctx.arc(0, 0, 6 + phase * 9, 0, Math.PI * 2);
  ctx.strokeStyle = p.color; ctx.globalAlpha = 1 - phase; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
  ctx.restore();
}
function equityPulseTick(ts) {
  if (equityHover < 0) { equityRaf = 0; return; }
  paintEquityOverlay(ts);
  equityRaf = requestAnimationFrame(equityPulseTick);
}

function equityHitTest(mx, my, rect) {
  const g = equityGeom; if (!g || !equityPoints.length) return -1;
  const kx = rect.width / g.W, ky = rect.height / g.H;   // logical → CSS px
  let best = -1, bestD = EQUITY_HIT_RADIUS * EQUITY_HIT_RADIUS;
  equityPoints.forEach((p, i) => {
    const dx = p.x * kx - mx, dy = p.y * ky - my, d = dx * dx + dy * dy;
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

function showEquityTooltip(idx) {
  const tip = document.getElementById('equityTooltip'), p = equityPoints[idx]; if (!tip || !p) return;
  const t = p.trade, v = pnl(t), r = t.actual_r == null ? NaN : Number(t.actual_r);
  const rText = isNaN(r) ? '' : `· ${fmtR(r)}`;
  tip.innerHTML =
    `<div style="font-weight:700;color:var(--text);">${escHtml(t.date)} · ${escHtml(t.sym)} <span class="dir-tag ${t.dir === 'Long' ? 'long' : 'short'}">${escHtml(t.dir)}</span></div>` +
    `<div style="margin-top:4px;color:${v >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtNum(v)} ${rText}</div>` +
    `<div style="color:var(--muted);font-size:10px;margin-top:2px;">Equity: ${p.equity < 0 ? '-' : ''}$${fmtAbs(Math.abs(p.equity))}</div>`;
  tip.style.display = 'block';
}
function positionEquityTooltip(mx, my, canvas) {
  const tip = document.getElementById('equityTooltip'); if (!tip) return;
  const tw = tip.offsetWidth, th = tip.offsetHeight, ww = (canvas.parentElement || canvas).clientWidth;
  let left = mx + 14, top = my - th - 12;
  if (ww && left + tw > ww) left = mx - tw - 14;   // flip to the left near the right edge
  if (left < 0) left = 0;
  if (top < 0) top = my + 16;                      // flip below the cursor near the top
  tip.style.left = left + 'px'; tip.style.top = top + 'px';
}

function onEquityMove(e) {
  const canvas = e.currentTarget, rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const idx = equityHitTest(mx, my, rect);
  if (idx < 0) { clearEquityHover(); return; }
  if (idx !== equityHover) {
    equityHover = idx; showEquityTooltip(idx); paintEquityOverlay(performance.now());
    if (!equityRaf && !equityReducedMotion()) equityRaf = requestAnimationFrame(equityPulseTick);
  }
  positionEquityTooltip(mx, my, canvas);
}
function initEquityHover() {
  const canvas = document.getElementById('equityCanvas'); if (!canvas) return;
  canvas.addEventListener('mousemove', onEquityMove);
  canvas.addEventListener('mouseleave', clearEquityHover);
  // touch: a tap fires a synthetic mousemove but never mouseleave — dismiss on any tap elsewhere
  document.addEventListener('touchstart', e => { if (e.target !== canvas) clearEquityHover(); }, { passive: true });
}

// ─── METRICS ──────────────────────────────────────────────────────────────────
function renderMetrics() {
  const trades = getActiveTrades(), wins = trades.filter(t => pnl(t) > 0), losses = trades.filter(t => pnl(t) <= 0);
  const totalPnl = trades.reduce((s, t) => s + pnl(t), 0);
  const winRate  = trades.length ? (wins.length / trades.length * 100) : 0;
  const avgWin   = wins.length   ? wins.reduce((s, t)   => s + pnl(t), 0) / wins.length   : 0;
  const avgLoss  = losses.length ? Math.abs(losses.reduce((s, t) => s + pnl(t), 0) / losses.length) : 0;
  const rr       = avgLoss ? (avgWin / avgLoss) : 0;
  const profitFactor = losses.length
    ? wins.reduce((s, t) => s + pnl(t), 0) / Math.abs(losses.reduce((s, t) => s + pnl(t), 0))
    : (wins.length ? Infinity : 0);
  const allPnls    = trades.map(t => pnl(t));
  const bestTrade  = allPnls.length ? Math.max(...allPnls) : 0;
  const worstTrade = allPnls.length ? Math.min(...allPnls) : 0;
  const port       = getActivePortfolio(), portRet = port && port.balance ? (totalPnl / port.balance * 100) : 0;

  const metrics = [
    { label: 'TOTAL P&L',     val: fmtNum(totalPnl),                                                   cls: totalPnl  >= 0 ? 'pos' : 'neg', sub: 'USD' },
    { label: 'NET RETURN',    val: (portRet >= 0 ? '+' : '') + portRet.toFixed(2) + '%',                cls: portRet   >= 0 ? 'pos' : 'neg', sub: 'on initial bal' },
    { label: 'WIN RATE',      val: winRate.toFixed(1) + '%',                                            cls: winRate   >= 50 ? 'pos' : 'neg', sub: `${wins.length}W / ${losses.length}L` },
    { label: 'AVG WIN',       val: fmtNum(avgWin),                                                      cls: 'pos',                           sub: 'per trade' },
    { label: 'AVG LOSS',      val: '-' + fmtAbs(avgLoss),                                               cls: 'neg',                           sub: 'per trade' },
    { label: 'BEST TRADE',    val: fmtNum(bestTrade),                                                   cls: bestTrade  >= 0 ? 'pos' : 'neg', sub: 'max profit' },
    { label: 'WORST TRADE',   val: fmtNum(worstTrade),                                                  cls: worstTrade <= 0 ? 'neg' : 'pos', sub: 'max drawdown' },
    { label: 'R:R RATIO',     val: rr ? rr.toFixed(2) : '—',                                           cls: rr >= 1 ? 'pos' : 'neg',         sub: 'avg win / avg loss' },
    { label: 'PROFIT FACTOR', val: profitFactor === Infinity ? '∞' : (profitFactor ? profitFactor.toFixed(2) : '—'), cls: (profitFactor >= 1 || profitFactor === Infinity) ? 'accent' : 'neg', sub: 'gross profit / loss' },
  ];
  document.getElementById('metricsRow').innerHTML = metrics.map((m, i) =>
    `<div class="metric-card${i === 0 ? ' primary' : ''}"><div class="mc-label">${m.label}</div><div class="mc-val ${m.cls}">${m.val}</div><div class="mc-sub">${m.sub}</div></div>`
  ).join('');
}

// ─── TABLE + PAGINATION ───────────────────────────────────────────────────────
// ─── DATE RANGE FILTER ────────────────────────────────────────────────────────
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// first date (YYYY-MM-DD, local) included in the range; null = no lower bound
function dateFilterStart(type = currentDateFilter) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (type === 'month')    d.setDate(1);
  else if (type === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // week starts Monday
  else if (type === '30d')  d.setDate(d.getDate() - 30);
  else return null;
  return localDateStr(d);
}
function getDateFilteredTrades() {
  const start = dateFilterStart(), all = getActiveTrades();
  return start ? all.filter(t => t.date >= start) : all;
}
function setDateFilter(type, el) {
  currentDateFilter = type; currentPage = 1;
  document.querySelectorAll('.filter-btn[data-date-filter]').forEach(b => b.classList.remove('active'));
  (el || document.querySelector(`.filter-btn[data-date-filter="${type}"]`))?.classList.add('active');
  renderTable(); drawEquity();
}

// balance after each trade (start balance + cumulative P&L, date order), keyed by trade id
function buildBalanceMap() {
  const map = {}; let bal = getActivePortfolio()?.balance || 0;
  [...getActiveTrades()].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => { bal += pnl(t); map[t.id] = bal; });
  return map;
}

function getFiltered() {
  const trades = getDateFilteredTrades();
  const search = (document.getElementById('searchInput')?.value || '').toUpperCase().trim();
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
      const k  = currentSort.key;
      if (k === 'actual_r') {            // trades without SL always sink to the bottom
        const na = a.actual_r == null, nb = b.actual_r == null;
        if (na || nb) return na === nb ? 0 : (na ? 1 : -1);
        return (Number(a.actual_r) - Number(b.actual_r)) * currentSort.dir;
      }
      const va = k === 'pnl' ? pnl(a) : (k === 'entry' ? a.entry_price : k === 'exit' ? a.exit_price : a[k]);
      const vb = k === 'pnl' ? pnl(b) : (k === 'entry' ? b.entry_price : k === 'exit' ? b.exit_price : b[k]);
      if (typeof va === 'string') return va.localeCompare(vb) * currentSort.dir;
      return (va - vb) * currentSort.dir;
    });
}

function renderTable() {
  const allRows = getFiltered(), tbody = document.getElementById('tradeBody');
  document.getElementById('emptyState').style.display = allRows.length ? 'none' : 'block';
  // "log first trade" only makes sense for an empty portfolio — not when filters merely hide the trades
  const cta = document.getElementById('emptyCta'); if (cta) cta.style.display = getActiveTrades().length ? 'none' : '';
  const totalPages = Math.ceil(allRows.length / rowsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const rowsToRender = allRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // คำนวณ running balance ณ แต่ละ trade (เรียง date ก่อน)
  const portfolio = getActivePortfolio();
  const startBal  = portfolio?.balance || 0;
  // สร้าง map: tradeId → balance หลัง trade นั้น (sort by date ascending)
  const runningBalMap = buildBalanceMap();

  tbody.innerHTML = rowsToRender.map((t, idx) => {
    const p = pnl(t), pp = pnlPct(t), win = p > 0;
    const rVal = t.actual_r == null ? NaN : Number(t.actual_r);
    const rCell = isNaN(rVal) ? '—'
      : rVal > 0 ? `<span class="tag-pill" style="color:var(--green);border-color:var(--green)">+${rVal.toFixed(2)}R</span>`
      : rVal < 0 ? `<span class="tag-pill" style="color:var(--red);border-color:var(--red)">${rVal.toFixed(2)}R</span>`
      :            `<span class="tag-pill">0.00R</span>`;
    const curBal    = runningBalMap[t.id] ?? 0;
    const balColor  = curBal >= startBal ? 'var(--green)' : 'var(--red)';
    const multStr   = (t.multiplier && t.multiplier !== 1) ? `<br><span style="font-size:9px;color:var(--muted)">x${t.multiplier}</span>` : '';
    const balStr    = startBal > 0
      ? `<br><span style="font-size:10px;color:${balColor}" title="Balance after trade">$${fmtAbs(curBal, 0)}</span>`
      : '';
    return `<tr class="row-enter ${win ? 'row-win' : 'row-loss'}" style="animation-delay:${idx * 0.02}s">
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${escHtml(t.date)}</td>
      <td style="font-weight:700;letter-spacing:1px;font-family:var(--mono)">${escHtml(t.sym)}</td>
      <td><span class="dir-tag ${t.dir === 'Long' ? 'long' : 'short'}">${t.dir === 'Long' ? '▲' : '▼'} ${escHtml(String(t.dir).toUpperCase())}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${t.entry_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.exit_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.size}${multStr}</td>
      <td><span class="pnl-cell ${win ? 'pos' : 'neg'}">${fmtNum(p)}</span></td>
      <td style="font-family:var(--mono);font-size:11px;color:${win ? 'var(--green)' : 'var(--red)'}">${(pp >= 0 ? '+' : '') + pp.toFixed(2)}%${balStr}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${rCell}</td>
      <td style="color:var(--muted);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis" class="col-setup">${escHtml(t.note) || '—'}</td>
      <td class="col-tag">${t.tag ? `<span class="tag-pill">${escHtml(t.tag)}</span>` : ''}</td>
      <td style="display:flex;gap:8px;">
        <button class="del-btn" style="color:var(--blue)" onclick="editTrade('${t.id}')" title="Edit" aria-label="Edit trade">✏️</button>
        <button class="del-btn" onclick="delTrade('${t.id}')" title="Delete" aria-label="Delete trade">✕</button>
      </td></tr>`;
  }).join('');

  let pgContainer = document.getElementById('pagination-container');
  if (!pgContainer) {
    document.querySelector('.table-scroll')?.insertAdjacentHTML('beforeend',
      '<div id="pagination-container" style="display:flex;justify-content:center;align-items:center;gap:16px;margin:20px 0 10px;"></div>');
    pgContainer = document.getElementById('pagination-container');
  }
  if (pgContainer) pgContainer.innerHTML = totalPages > 1
    ? `<button class="btn-ghost" style="padding:4px 12px;font-size:11px;" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>◀ PREV</button>` +
      `<span style="font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:1px;">PAGE ${currentPage} OF ${totalPages}</span>` +
      `<button class="btn-ghost" style="padding:4px 12px;font-size:11px;" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>NEXT ▶</button>`
    : '';
}

function changePage(dir) { currentPage += dir; renderTable(); }
function setFilter(f, el) {
  currentFilter = f; currentPage = 1;
  document.querySelectorAll('.filter-btn:not([data-date-filter])').forEach(b => b.classList.remove('active'));
  el.classList.add('active'); renderTable();
}
function sortBy(key) {
  currentSort = { key, dir: currentSort.key === key ? currentSort.dir * -1 : -1 };
  currentPage = 1; renderTable();
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function renderBreakdown() {
  const trades = getActiveTrades(), wins = trades.filter(t => pnl(t) > 0), losses = trades.filter(t => pnl(t) <= 0);
  const total = trades.length || 1, wPct = (wins.length / total * 100).toFixed(0), lPct = (losses.length / total * 100).toFixed(0);
  const totalWin = wins.reduce((s, t) => s + pnl(t), 0), totalLoss = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));
  document.getElementById('breakdown').innerHTML =
    `<div class="breakdown-bar">` +
    `<div class="bar-row"><span class="bar-label">WIN</span><span style="color:var(--green)">${wins.length} (${wPct}%)</span></div>` +
    `<div class="bar-track"><div class="bar-fill green" style="width:${wPct}%"></div></div>` +
    `<div class="bar-row"><span class="bar-label">LOSS</span><span style="color:var(--red)">${losses.length} (${lPct}%)</span></div>` +
    `<div class="bar-track"><div class="bar-fill red" style="width:${lPct}%"></div></div>` +
    `<div class="bar-row" style="margin-top:4px"><span class="bar-label">GROSS PROFIT</span><span style="color:var(--green)">${fmtNum(totalWin)}</span></div>` +
    `<div class="bar-row"><span class="bar-label">GROSS LOSS</span><span style="color:var(--red)">-${fmtAbs(totalLoss)}</span></div>` +
    `</div>`;
}

function renderSymPerf() {
  const map = {}; getActiveTrades().forEach(t => { map[t.sym] = (map[t.sym] || 0) + pnl(t); });
  const sorted = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  document.getElementById('symPerf').innerHTML = sorted.length
    ? sorted.map(([sym, p]) => `<div class="sym-row"><span class="sym-name">${escHtml(sym)}</span><span class="sym-pnl ${p >= 0 ? 'pos' : 'neg'}">${fmtNum(p)}</span></div>`).join('')
    : '<div style="padding:16px 20px;color:var(--muted);font-family:var(--mono);font-size:11px">No data yet</div>';
}

function renderStreak() {
  const sorted = [...getActiveTrades()].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0, streakType = null, best = 0, bestType = null, cur = 0, curType = null;
  sorted.forEach(t => {
    const type = pnl(t) > 0 ? 'win' : 'loss';
    if (type === curType) { cur++; } else { curType = type; cur = 1; }
    if (cur > best) { best = cur; bestType = type; }
    streak = cur; streakType = type;
  });
  const dots = sorted.slice(-20).map(t =>
    `<div class="streak-dot ${pnl(t) > 0 ? 'w' : 'l'}" title="${escHtml(t.sym)} ${pnl(t) > 0 ? '+' : ''}${pnl(t).toFixed(0)}"></div>`
  ).join('');
  document.getElementById('streakBlock').innerHTML =
    `<div class="streak-block">` +
    `<div class="streak-num ${streakType || ''}">${streak || 0}</div>` +
    `<div class="streak-label">CURRENT ${streakType ? streakType.toUpperCase() + ' STREAK' : 'STREAK'}</div>` +
    `<div class="streak-dots">${dots}</div>` +
    `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:12px">BEST: ${best} ${bestType ? bestType.toUpperCase() + 'S' : '—'}</div>` +
    `</div>`;
}

// ─── HEATMAP (CALENDAR MATRIX) ────────────────────────────────────────────────
function changeHeatmapMonth(offset) {
  heatmapDate = new Date(heatmapDate.getFullYear(), heatmapDate.getMonth() + offset, 1);
  renderHeatmap();
}

function renderHeatmap() {
  const isLight = document.documentElement.classList.contains('light');
  const emptyBg = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
  const trades = getActiveTrades();
  
  // Calculate P&L and trades grouped by date
  const dataByDate = {};
  trades.forEach(t => {
    if (!dataByDate[t.date]) dataByDate[t.date] = { pnl: 0, count: 0, wins: 0, losses: 0, trades: [] };
    const p = pnl(t);
    dataByDate[t.date].pnl += p;
    dataByDate[t.date].count += 1;
    if (p > 0) dataByDate[t.date].wins += 1;
    else dataByDate[t.date].losses += 1;
    dataByDate[t.date].trades.push(t);
  });

  const year = heatmapDate.getFullYear(), month = heatmapDate.getMonth();
  // Monday as first day of week: (day + 6) % 7
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7; 
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  const vals = Object.values(dataByDate).map(d => Math.abs(d.pnl)).filter(v => v > 0);
  const maxAbs = vals.length ? Math.max(...vals) : 1;

  // Month title in header
  const titleEl = document.getElementById('heatmapMonthTitle');
  if (titleEl) {
    titleEl.textContent = heatmapDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  }

  let html = `<div class="hmap-calendar-grid">`;
  // Day headers (Mon - Sun)
  const dayNames = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  dayNames.forEach(d => {
    html += `<div class="hmap-col-header">${d}</div>`;
  });

  // Empty cells before start of month
  for (let i = 0; i < startDow; i++) {
    html += `<div class="hmap-day-cell empty"></div>`;
  }

  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const info = dataByDate[dateStr];
    const val = info ? info.pnl : 0;
    const count = info ? info.count : 0;

    let bg = emptyBg;
    let border = 'var(--border)';
    let pnlStr = '';
    let dotsHtml = '';

    if (info && count > 0) {
      const intensity = Math.min(0.88, 0.22 + (Math.abs(val) / maxAbs) * 0.68);
      if (val > 0) {
        bg = isLight ? `rgba(22,163,74,${intensity.toFixed(2)})` : `rgba(60,255,160,${intensity.toFixed(2)})`;
        border = isLight ? `rgba(22,163,74,0.55)` : `rgba(60,255,160,0.55)`;
        pnlStr = `<span class="hmap-day-pnl pos">+${fmtAbs(Math.abs(val), 0)} USD</span>`;
      } else if (val < 0) {
        bg = isLight ? `rgba(220,38,38,${intensity.toFixed(2)})` : `rgba(255,69,96,${intensity.toFixed(2)})`;
        border = isLight ? `rgba(220,38,38,0.55)` : `rgba(255,69,96,0.55)`;
        pnlStr = `<span class="hmap-day-pnl neg">-${fmtAbs(Math.abs(val), 0)} USD</span>`;
      } else {
        bg = isLight ? `rgba(0,0,0,0.06)` : `rgba(255,255,255,0.08)`;
        pnlStr = `<span class="hmap-day-pnl zero">0 USD</span>`;
      }
      dotsHtml = `<div class="hmap-day-dots">` + 
        info.trades.slice(0, 4).map(t => `<div class="hmap-dot ${pnl(t) > 0 ? 'win' : 'loss'}"></div>`).join('') +
        `</div>`;
    }

    const titleAttr = info 
      ? `${dateStr}: ${fmtNum(val)} (${count} trades: ${info.wins}W / ${info.losses}L)`
      : dateStr;

    html += `<div class="hmap-day-cell" style="background:${bg};border-color:${border};" onclick="filterByDate('${dateStr}')" title="${titleAttr}">
      <span class="hmap-day-num">${d}</span>
      ${pnlStr}
      ${dotsHtml}
    </div>`;
  }

  html += `</div>`;
  const container = document.getElementById('heatmap');
  if (container) container.innerHTML = html;
}

// ─── FILTER BY HEATMAP DATE CLICK ─────────────────────────────────────────────
function filterByDate(dateStr) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    if (searchInput.value === dateStr) {
      searchInput.value = '';
      toast(`Cleared date filter`);
    } else {
      searchInput.value = dateStr;
      toast(`Filtered for ${dateStr}`);
    }
    currentPage = 1;
    renderTable();
    renderRecentFeed();
  }
}

// ─── RECENT TRADES FEED (LIVE STREAM) ─────────────────────────────────────────
function renderRecentFeed() {
  const container = document.getElementById('recentTradesFeed');
  if (!container) return;
  const filtered = getFiltered();
  const emptyEl = document.getElementById('emptyStateCompact');
  
  if (!filtered.length) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Take the most recent 12 trades
  const recent = filtered.slice(0, 12);
  container.innerHTML = recent.map(t => {
    const p = pnl(t);
    const win = p > 0;
    const rVal = t.actual_r == null ? NaN : Number(t.actual_r);
    const rBadge = isNaN(rVal) ? ''
      : rVal > 0 ? `<span class="feed-r-badge pos">+${rVal.toFixed(2)}R</span>`
      : rVal < 0 ? `<span class="feed-r-badge neg">${rVal.toFixed(2)}R</span>`
      : `<span class="feed-r-badge">0.00R</span>`;

    return `<div class="feed-trade-item" onclick="editTrade('${t.id}')" title="Click to edit ${escHtml(t.sym)}">
      <div class="feed-item-left">
        <span class="feed-sym-badge">${escHtml(t.sym)}</span>
        <span class="feed-dir-pill ${t.dir === 'Long' ? 'long' : 'short'}">${t.dir === 'Long' ? '▲' : '▼'} ${escHtml(t.dir.toUpperCase())}</span>
        <span class="feed-date-text">${escHtml(t.date)}</span>
      </div>
      <div class="feed-item-right">
        <span class="feed-pnl-val ${win ? 'pos' : 'neg'}">${fmtNum(p)}</span>
        ${rBadge}
      </div>
    </div>`;
  }).join('');
}

// ─── VIEW SWITCHER & NAVIGATION ───────────────────────────────────────────────
function switchMainView(view) {
  const dashView = document.getElementById('bentoDashboardView');
  const journalView = document.getElementById('fullJournalView');
  const btnDash = document.getElementById('navBtnDashboard');
  const btnJournal = document.getElementById('navBtnJournal');

  if (view === 'journal') {
    if (dashView) dashView.style.display = 'none';
    if (journalView) journalView.style.display = 'block';
    if (btnDash) btnDash.classList.remove('active');
    if (btnJournal) btnJournal.classList.add('active');
    renderTable();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    if (dashView) dashView.style.display = 'grid';
    if (journalView) journalView.style.display = 'none';
    if (btnDash) btnDash.classList.add('active');
    if (btnJournal) btnJournal.classList.remove('active');
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function scrollToBentoCard(cardId) {
  switchMainView('dashboard');
  const el = document.getElementById(cardId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.borderColor = 'var(--green)';
    el.style.boxShadow = '0 0 25px rgba(60,255,160,0.3)';
    setTimeout(() => {
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }, 1500);
  }
}

// ─── CARD EXPAND / FULLSCREEN EXTEND ─────────────────────────────────────────
function toggleExpandCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const isExpanded = card.classList.contains('is-expanded');
  
  // Close any already open expanded card
  document.querySelectorAll('.bento-card.is-expanded').forEach(c => {
    c.classList.remove('is-expanded');
  });
  document.body.classList.remove('card-modal-open');

  let backdrop = document.getElementById('cardExpandBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'cardExpandBackdrop';
    backdrop.className = 'card-expand-backdrop';
    backdrop.onclick = closeAllExpandedCards;
    document.body.appendChild(backdrop);
  }

  if (!isExpanded) {
    card.classList.add('is-expanded');
    document.body.classList.add('card-modal-open');
    backdrop.classList.add('active');
    
    // Auto-scroll inside card to top
    card.scrollTop = 0;
    
    // Re-draw chart on equity card expand
    if (cardId === 'cardEquity') {
      setTimeout(drawEquity, 200);
    }
    toast(`Extended view mode`);
  } else {
    backdrop.classList.remove('active');
    if (cardId === 'cardEquity') {
      setTimeout(drawEquity, 200);
    }
  }
}

function closeAllExpandedCards() {
  const hadExpanded = document.querySelector('.bento-card.is-expanded');
  document.querySelectorAll('.bento-card.is-expanded').forEach(c => {
    c.classList.remove('is-expanded');
  });
  document.body.classList.remove('card-modal-open');
  const backdrop = document.getElementById('cardExpandBackdrop');
  if (backdrop) backdrop.classList.remove('active');
  if (hadExpanded && hadExpanded.id === 'cardEquity') {
    setTimeout(drawEquity, 200);
  }
}