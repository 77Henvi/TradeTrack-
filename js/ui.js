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

  let _searchTimer = 0;   // debounce: re-render once typing pauses, not on every keystroke
  document.getElementById('searchInput')?.addEventListener('input', () => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      currentPage = 1;
      renderTable();
      renderRecentFeed();
      if (document.getElementById('cardTrades')?.classList.contains('is-expanded')) {
        renderExtendedTradesTable();
      }
    }, 120);
  });

  ['f-entry','f-exit','f-size','f-mult','f-sl','f-tp'].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener('input', updatePreview);
  });

  initEquityHover();
}

// ─── GLOBAL KEYBOARD SHORTCUTS ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAllExpandedCards();
    closeTradeDetailsDirect();
    closeModalDirect();
    closeImportModalDirect();
    document.getElementById('notionOverlay')?.classList.remove('open');
    document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
    document.getElementById('portfolioSettingsOverlay')?.classList.remove('open');
    document.getElementById('newPortfolioOverlay')?.classList.remove('open');
    document.getElementById('confirmOverlay')?.classList.remove('open');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openModal(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    const s = document.getElementById('searchInput');
    if (s) { s.focus(); s.select(); }
  }
});

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
// ─── MOTION ───────────────────────────────────────────────────────────────────
// Two curves, both also available as CSS variables: --ease (fast start, soft landing) and --ease-io (slow, fast, slow).
// Everything here uses the Web Animations API, so nothing re-renders or forces layout, and it is skipped
// when the visitor asks for reduced motion.
const EASE = 'cubic-bezier(.22, 1, .36, 1)';
const EASE_IO = 'cubic-bezier(.65, 0, .35, 1)';
const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// a changed number flashes the accent color and settles back to its own color
function flashEl(el) {
  if (!el || !motionOK()) return;
  el.animate([{ color: 'var(--accent)' }, { color: getComputedStyle(el).color }], { duration: 900, easing: EASE });
}
// set text, and flash only when an already-shown value changes (not on first paint)
function setTextFlash(el, text) {
  if (!el) return;
  const changed = el.dataset.seen === '1' && el.textContent !== text;
  el.textContent = text; el.dataset.seen = '1';
  if (changed) flashEl(el);
}
// a view fades in and rises 8px when you switch to it
function enterView(el) {
  if (!el || !motionOK()) return;
  el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: EASE });
}
// a bar grows or shrinks from its previous width, using transform so the layout stays still
let _barPrev = {};
function growBars(container, key) {
  if (!container) return;
  const fills = [...container.querySelectorAll('.bar-fill')];
  const now = fills.map(f => parseFloat(f.style.width) || 0);
  const prev = _barPrev[key];
  _barPrev[key] = now;
  if (!prev || !motionOK()) return;
  fills.forEach((f, i) => {
    if (!now[i] || prev[i] === now[i]) return;
    f.animate([{ transform: `scaleX(${prev[i] / now[i]})` }, { transform: 'scaleX(1)' }], { duration: 450, easing: EASE_IO });
  });
}

// Hero "TOTAL PORTFOLIO BALANCE" + the "Trading Accounts" card: same data, updated together,
// independent of drawEquity()'s early returns (empty range / hidden canvas) that used to leave them stale.
function syncBalanceDisplays() {
  const port = getActivePortfolio(); if (!port) return;
  const s = portfolioStats(port), sign = s.ret >= 0 ? '+' : '';
  const money = `$${fmtAbs(s.bal, 2)}`, pct = `${sign}${s.ret.toFixed(2)}%`;

  const hero = document.getElementById('heroBalanceDisplay');
  setTextFlash(hero, money);
  const heroRet = document.getElementById('heroReturnBadge');
  if (heroRet) { heroRet.textContent = pct; heroRet.className = `hero-return-badge ${s.ret >= 0 ? 'pos' : 'neg'}`; }

  const nameEl = document.getElementById('cardAccountName');
  if (nameEl) nameEl.textContent = port.name;
  const bal = document.getElementById('cardBalanceDisplay');
  setTextFlash(bal, money);
  const pill = document.getElementById('cardReturnPill');
  if (pill) { pill.textContent = pct; pill.style.color = s.ret >= 0 ? 'var(--green)' : 'var(--red)'; }
}

function render() {
  syncBalanceDisplays();
  drawEquity();
  renderMetrics();
  renderTable();
  renderRecentFeed();
  renderBreakdown();
  renderSymPerf();
  renderStreak();
  renderHeatmap();
}

// ─── EQUITY CURVE (SMOOTH BEZIER SPLINE & HATCH SHADING) ─────────────────────
function drawEquity() {
  const trades = getDateFilteredTrades(), canvas = document.getElementById('equityCanvas'); if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.offsetWidth; if (W === 0) return;
  const H = canvas.offsetHeight || 220;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const isLight = document.documentElement.classList.contains('light');
  const sorted  = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  resetEquityHover(); equityPoints = []; equityBase = null;

  if (sorted.length === 0) {
    document.getElementById('equityStats').innerHTML =
      `<div class="equity-stat"><div class="el">${t('equity.statTotalPnl')}</div><div class="ev">+0.00</div></div>` +
      `<div class="equity-stat"><div class="el">${t('equity.statWinRate')}</div><div class="ev">0%</div></div>` +
      `<div class="equity-stat"><div class="el">${t('equity.statMaxDD')}</div><div class="ev neg">0.00</div></div>` +
      `<div class="equity-stat"><div class="el">${t('equity.statTrades')}</div><div class="ev">0</div></div>`;
    return;
  }

  // 1. Dotted Matrix Background (matching Image 2)
  ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';
  for (let x = 16; x < W - 16; x += 22) {
    for (let y = 16; y < H - 16; y += 22) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2. Data Calculation
  const points = [0]; let running = 0;
  sorted.forEach(t => { running += pnl(t); points.push(running); });
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const padLeft = 68, padRight = W > 600 ? 140 : 24, padTop = 32, padBottom = 32;
  const xs = i => padLeft + (i / (points.length - 1)) * (W - padLeft - padRight);
  const ys = v => padTop + (1 - (v - min) / range) * (H - padTop - padBottom);

  // 3. Y-Axis Capsule Pills on Left (matching Image 2)
  const yTicks = [min, min + range * 0.5, max];
  yTicks.forEach(val => {
    const y = ys(val);
    const pw = 50, ph = 20, px = 8, py = y - ph / 2;
    ctx.fillStyle = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.06)';
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 10);
    else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLight ? '#475569' : '#cbd5e1';
    ctx.font = '700 9.5px var(--mono)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const txt = Math.abs(val) >= 1000 ? `$${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}K` : `$${Math.round(val)}`;
    ctx.fillText(txt, px + pw / 2, y);
  });

  // 4. Coordinates & Bezier Spline Helper
  const pts = points.map((p, i) => ({ x: xs(i), y: ys(p) }));
  function traceSpline(c, pList) {
    if (pList.length < 2) return;
    c.moveTo(pList[0].x, pList[0].y);
    for (let i = 0; i < pList.length - 1; i++) {
      const p0 = pList[Math.max(0, i - 1)];
      const p1 = pList[i];
      const p2 = pList[i + 1];
      const p3 = pList[Math.min(pList.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 4.5;
      const cp1y = p1.y + (p2.y - p0.y) / 4.5;
      const cp2x = p2.x - (p3.x - p1.x) / 4.5;
      const cp2y = p2.y - (p3.y - p1.y) / 4.5;
      c.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  // 5. Diagonal Hatch Shading under Main Curve (matching Image 2)
  const hatchCanvas = document.createElement('canvas');
  hatchCanvas.width = 16; hatchCanvas.height = 16;
  const hpCtx = hatchCanvas.getContext('2d');
  hpCtx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.07)' : 'rgba(56, 189, 248, 0.12)';
  hpCtx.lineWidth = 1.5;
  hpCtx.beginPath();
  hpCtx.moveTo(0, 16); hpCtx.lineTo(16, 0);
  hpCtx.moveTo(-4, 4); hpCtx.lineTo(4, -4);
  hpCtx.moveTo(12, 20); hpCtx.lineTo(20, 12);
  hpCtx.stroke();
  const hatchPattern = ctx.createPattern(hatchCanvas, 'repeat');

  ctx.save();
  ctx.beginPath();
  traceSpline(ctx, pts);
  const lastPt = pts[pts.length - 1];
  ctx.lineTo(lastPt.x, H - 15);
  ctx.lineTo(pts[0].x, H - 15);
  ctx.closePath();
  ctx.clip();

  // Gradient fill under curve
  const fillGrad = ctx.createLinearGradient(0, padTop, 0, H);
  fillGrad.addColorStop(0, isLight ? 'rgba(37, 99, 235, 0.16)' : 'rgba(56, 189, 248, 0.22)');
  fillGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = fillGrad;
  ctx.fillRect(0, 0, W, H);

  // Diagonal hatch stripes overlay
  ctx.fillStyle = hatchPattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // 6. Secondary Smooth Benchmark Line (matching Image 2 gray curve)
  const compPts = points.map((p, i) => {
    const baselineY = ys(0) + (ys(points[i]) - ys(0)) * 0.45;
    return { x: xs(i), y: baselineY };
  });
  ctx.beginPath();
  traceSpline(ctx, compPts);
  ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.22)' : 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const lastComp = compPts[compPts.length - 1];
  ctx.beginPath();
  ctx.arc(lastComp.x, lastComp.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = isLight ? '#94a3b8' : '#64748b';
  ctx.fill();

  // 7. Primary Gradient Bezier Stroke (Emerald to Cyan/Blue)
  const strokeGrad = ctx.createLinearGradient(padLeft, 0, lastPt.x, 0);
  strokeGrad.addColorStop(0, '#22c55e'); // emerald green
  strokeGrad.addColorStop(0.5, '#38bdf8'); // electric cyan
  strokeGrad.addColorStop(1, '#00a8ff'); // vibrant blue

  ctx.beginPath();
  traceSpline(ctx, pts);
  ctx.strokeStyle = strokeGrad;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Primary Endpoint Dot
  ctx.beginPath();
  ctx.arc(lastPt.x, lastPt.y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = '#00a8ff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lastPt.x, lastPt.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // 8. Vertical Guideline & Right-Side Floating Glass Pills (matching Image 2)
  ctx.beginPath();
  ctx.moveTo(lastPt.x, padTop - 10);
  ctx.lineTo(lastPt.x, H - padBottom + 10);
  ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (W > 560) {
    const pillX = Math.min(W - 134, lastPt.x + 14);
    const topPillY = Math.max(padTop - 8, lastPt.y - 14);
    
    // Top Callout Pill
    ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
    ctx.font = '600 8.5px var(--mono)';
    ctx.textAlign = 'left';
    ctx.fillText(t('equity.growthTrend'), pillX, topPillY - 5);

    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(18, 22, 32, 0.88)';
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    const pillW = 118, pillH = 24;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pillX, topPillY, pillW, pillH, 12);
    else ctx.rect(pillX, topPillY, pillW, pillH);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pillX + 10, topPillY + pillH / 2, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();

    ctx.fillStyle = isLight ? '#0f172a' : '#ffffff';
    ctx.font = '800 10.5px var(--mono)';
    ctx.textAlign = 'left';
    ctx.fillText(`${running >= 0 ? '+' : ''}$${fmtAbs(running)}`, pillX + 20, topPillY + pillH / 2 + 3);

    // Bottom Comparison Pill
    const btmPillY = Math.min(H - padBottom, lastComp.y + 4);
    ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
    ctx.font = '600 8.5px var(--mono)';
    ctx.fillText(t('equity.benchmarkBase'), pillX, btmPillY - 5);

    ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(18, 22, 32, 0.88)';
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(pillX, btmPillY, pillW, pillH, 12);
    else ctx.rect(pillX, btmPillY, pillW, pillH);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pillX + 10, btmPillY + pillH / 2, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#64748b';
    ctx.fill();

    const port = getActivePortfolio();
    const baseBal = port?.balance || 5000;
    ctx.fillStyle = isLight ? '#0f172a' : '#ffffff';
    ctx.font = '800 10.5px var(--mono)';
    ctx.fillText(`$${fmtAbs(baseBal)}`, pillX + 20, btmPillY + pillH / 2 + 3);
  }

  // Hover Overlay Geometry
  const balMap = buildBalanceMap();
  equityPoints = sorted.map((t, i) => ({
    x: xs(i + 1), y: ys(points[i + 1]), trade: t, equity: balMap[t.id],
    color: pnl(t) > 0 ? '#22c55e' : (isLight ? '#dc2626' : '#ff4560'),
  }));
  equityGeom = { dpr, W, H, isLight };
  try { equityBase = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { equityBase = null; }

  let peak = points[0], maxDD = 0;
  points.forEach(p => { if (p > peak) peak = p; const dd = peak - p; if (dd > maxDD) maxDD = dd; });
  const wins = trades.filter(tr => pnl(tr) > 0), wr = trades.length ? (wins.length / trades.length * 100) : 0;
  document.getElementById('equityStats').innerHTML =
    `<div class="equity-stat"><div class="el">${t('equity.statTotalPnl')}</div><div class="ev ${running >= 0 ? 'pos' : 'neg'}">${fmtNum(running)}</div></div>` +
    `<div class="equity-stat"><div class="el">${t('equity.statWinRate')}</div><div class="ev ${wr >= 50 ? 'pos' : 'neg'}">${wr.toFixed(1)}%</div></div>` +
    `<div class="equity-stat"><div class="el">${t('equity.statMaxDD')}</div><div class="ev neg">${fmtNum(-Math.abs(maxDD))}</div></div>` +
    `<div class="equity-stat"><div class="el">${t('equity.statTrades')}</div><div class="ev">${trades.length}</div></div>`;
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

// state + tooltip reset only (no repaint). Used when the chart itself is being redrawn
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
    ctx.setTransform(equityGeom.dpr, 0, 0, equityGeom.dpr, 0, 0);
  }
}

function paintEquityOverlay(ts) {
  const canvas = document.getElementById('equityCanvas'), g = equityGeom, p = equityPoints[equityHover];
  if (!canvas || !g || !p || !equityBase) return;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.putImageData(equityBase, 0, 0);
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);

  // vertical crosshair
  ctx.beginPath(); ctx.moveTo(p.x, 4); ctx.lineTo(p.x, g.H - 4);
  ctx.strokeStyle = g.isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);

  // pulsing ring
  const phase = equityReducedMotion() ? 0.3 : ((ts || 0) % 1200) / 1200;
  ctx.save(); ctx.translate(p.x, p.y);
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
  const kx = rect.width / g.W, ky = rect.height / g.H;   // logical to CSS px
  let best = -1, bestD = EQUITY_HIT_RADIUS * EQUITY_HIT_RADIUS;
  equityPoints.forEach((p, i) => {
    const dx = p.x * kx - mx, dy = p.y * ky - my, d = dx * dx + dy * dy;
    if (d <= bestD) { bestD = d; best = i; }
  });
  return best;
}

function showEquityTooltip(idx) {
  const tip = document.getElementById('equityTooltip'), p = equityPoints[idx]; if (!tip || !p) return;
  const tr = p.trade, v = pnl(tr), r = tr.actual_r == null ? NaN : Number(tr.actual_r);
  const rText = isNaN(r) ? '' : `· ${fmtR(r)}`;
  tip.innerHTML =
    `<div style="font-weight:700;color:var(--text);">${escHtml(tr.date)} · ${escHtml(tr.sym)} <span class="dir-tag ${tr.dir === 'Long' ? 'long' : 'short'}">${escHtml(tr.dir)}</span></div>` +
    `<div style="margin-top:4px;color:${v >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtNum(v)} ${rText}</div>` +
    `<div style="color:var(--muted);font-size:10px;margin-top:2px;">${t('equity.tooltipEquity')}: ${p.equity < 0 ? '-' : ''}$${fmtAbs(Math.abs(p.equity))}</div>`;
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
  // touch: a tap fires a synthetic mousemove but never mouseleave. Dismiss on any tap elsewhere
  document.addEventListener('touchstart', e => { if (e.target !== canvas) clearEquityHover(); }, { passive: true });
}

// ─── STAT CARDS ───────────────────────────────────────────────────────────────
let _prevStatValues = null;
function statCard({ title, value, change, note, up }) {
  return `<div class="stat-card">
    <p class="stat-title">${title}</p>
    <h2 class="stat-value">${value}</h2>
    <p class="stat-change ${up ? 'up' : 'down'}">${change}<span class="stat-note">${note}</span></p>
  </div>`;
}

function renderMetrics() {
  const el = document.getElementById('metricsRow');
  if (!el) return;
  const trades = getActiveTrades(), wins = trades.filter(t => pnl(t) > 0), losses = trades.filter(t => pnl(t) <= 0);
  const totalPnl = trades.reduce((s, t) => s + pnl(t), 0);
  const winRate  = trades.length ? (wins.length / trades.length * 100) : 0;
  const avgWin   = wins.length   ? wins.reduce((s, t)   => s + pnl(t), 0) / wins.length   : 0;
  const avgLoss  = losses.length ? Math.abs(losses.reduce((s, t) => s + pnl(t), 0) / losses.length) : 0;
  const rr       = avgLoss ? (avgWin / avgLoss) : 0;
  const grossW   = wins.reduce((s, t) => s + pnl(t), 0);
  const grossL   = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));
  const pf       = grossL ? grossW / grossL : (wins.length ? Infinity : 0);
  const allPnls  = trades.map(t => pnl(t));
  const best     = allPnls.length ? Math.max(...allPnls) : 0;
  const worst    = allPnls.length ? Math.min(...allPnls) : 0;
  const port     = getActivePortfolio(), portRet = port && port.balance ? (totalPnl / port.balance * 100) : 0;
  const sgn = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';

  const cards = [
    { title: t('stats.totalPnl'),     value: fmtNum(totalPnl),
      change: sgn(portRet), note: t('stats.onInitial'), up: portRet >= 0 },
    { title: t('stats.winRate'),      value: winRate.toFixed(1) + '%',
      change: sgn(winRate - 50), note: t('stats.vs50', { w: wins.length, l: losses.length }), up: winRate >= 50 },
    { title: t('stats.profitFactor'), value: pf === Infinity ? '∞' : (pf ? pf.toFixed(2) : '—'),
      change: 'R:R ' + (rr ? rr.toFixed(2) : '—'), note: t('stats.avgWinLoss'), up: pf >= 1 },
    { title: t('stats.bestTrade'),    value: fmtNum(best),
      change: fmtNum(worst), note: t('stats.worstTrade'), up: false },
  ];
  el.innerHTML = cards.map(statCard).join('');
  const vals = cards.map(c => c.value);
  if (_prevStatValues) el.querySelectorAll('.stat-value').forEach((n, i) => { if (_prevStatValues[i] !== vals[i]) flashEl(n); });
  _prevStatValues = vals;
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
  document.querySelectorAll('.filter-btn[data-date-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.dateFilter === type);
  });
  renderTable(); drawEquity(); renderRecentFeed();
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
  // "log first trade" only makes sense for an empty portfolio. Not when filters merely hide the trades
  const cta = document.getElementById('emptyCta'); if (cta) cta.style.display = getActiveTrades().length ? 'none' : '';
  const totalPages = Math.ceil(allRows.length / rowsPerPage) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const rowsToRender = allRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // คำนวณ running balance ณ แต่ละ trade (เรียง date ก่อน)
  const portfolio = getActivePortfolio();
  const startBal  = portfolio?.balance || 0;
  // สร้าง map: tradeId to balance หลัง trade นั้น (sort by date ascending)
  const runningBalMap = buildBalanceMap();

  tbody.innerHTML = rowsToRender.map((tr, idx) => {
    const p = pnl(tr), pp = pnlPct(tr), win = p > 0;
    const rVal = tr.actual_r == null ? NaN : Number(tr.actual_r);
    const rCell = isNaN(rVal) ? '—'
      : rVal > 0 ? `<span class="tag-pill" style="color:var(--green);border-color:var(--green)">+${rVal.toFixed(2)}R</span>`
      : rVal < 0 ? `<span class="tag-pill" style="color:var(--red);border-color:var(--red)">${rVal.toFixed(2)}R</span>`
      :            `<span class="tag-pill">0.00R</span>`;
    const curBal    = runningBalMap[tr.id] ?? 0;
    const balColor  = curBal >= startBal ? 'var(--green)' : 'var(--red)';
    const multStr   = (tr.multiplier && tr.multiplier !== 1) ? `<br><span style="font-size:9px;color:var(--muted)">x${tr.multiplier}</span>` : '';
    const balStr    = startBal > 0
      ? `<br><span style="font-size:10px;color:${balColor}" title="${escHtml(t('trd.balAfterTitle'))}">$${fmtAbs(curBal, 0)}</span>`
      : '';
    return `<tr class="row-enter ${win ? 'row-win' : 'row-loss'}" style="animation-delay:${idx * 0.02}s">
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${escHtml(tr.date)}</td>
      <td style="font-weight:700;letter-spacing:1px;font-family:var(--mono)">${escHtml(tr.sym)}</td>
      <td><span class="dir-tag ${tr.dir === 'Long' ? 'long' : 'short'}">${tr.dir === 'Long' ? '▲' : '▼'} ${escHtml(String(tr.dir).toUpperCase())}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${tr.entry_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${tr.exit_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${tr.size}${multStr}</td>
      <td><span class="pnl-cell ${win ? 'pos' : 'neg'}">${fmtNum(p)}</span></td>
      <td style="font-family:var(--mono);font-size:11px;color:${win ? 'var(--green)' : 'var(--red)'}">${(pp >= 0 ? '+' : '') + pp.toFixed(2)}%${balStr}</td>
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${rCell}</td>
      <td style="color:var(--muted);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis" class="col-setup">${escHtml(tr.note) || '—'}</td>
      <td class="col-tag">${tr.tag ? `<span class="tag-pill">${escHtml(tr.tag)}</span>` : ''}</td>
      <td style="display:flex;gap:8px;">
        <button class="del-btn" style="color:var(--blue)" onclick="editTrade('${tr.id}')" title="${escHtml(t('trd.editTitle'))}" aria-label="${escHtml(t('trd.editTitle'))}">✏️</button>
        <button class="del-btn" onclick="delTrade('${tr.id}')" title="${escHtml(t('trd.deleteTitle'))}" aria-label="${escHtml(t('trd.deleteTitle'))}">✕</button>
      </td></tr>`;
  }).join('');

  let pgContainer = document.getElementById('pagination-container');
  if (!pgContainer) {
    document.querySelector('.table-scroll')?.insertAdjacentHTML('beforeend',
      '<div id="pagination-container" style="display:flex;justify-content:center;align-items:center;gap:16px;margin:20px 0 10px;"></div>');
    pgContainer = document.getElementById('pagination-container');
  }
  if (pgContainer) pgContainer.innerHTML = totalPages > 1
    ? `<button class="btn-ghost" style="padding:4px 12px;font-size:11px;" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>${t('trd.prevPage')}</button>` +
      `<span style="font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:1px;">${t('trd.pageOf', { cur: currentPage, total: totalPages })}</span>` +
      `<button class="btn-ghost" style="padding:4px 12px;font-size:11px;" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>${t('trd.nextPage')}</button>`
    : '';
}

function changePage(dir) { currentPage += dir; renderTable(); }
function setFilter(f, el) {
  currentFilter = f; currentPage = 1;
  document.querySelectorAll('.filter-btn:not([data-date-filter])').forEach(b => {
    const oc = b.getAttribute('onclick') || '';
    b.classList.toggle('active', oc.includes(`'${f}'`));
  });
  if (el) el.classList.add('active');
  renderTable();
  renderRecentFeed();
}
function sortBy(key) {
  currentSort = { key, dir: currentSort.key === key ? currentSort.dir * -1 : -1 };
  currentPage = 1; renderTable();
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
function renderBreakdown() {
  const trades = getActiveTrades(), wins = trades.filter(tr => pnl(tr) > 0), losses = trades.filter(tr => pnl(tr) <= 0);
  const total = trades.length || 1, wPct = (wins.length / total * 100).toFixed(0), lPct = (losses.length / total * 100).toFixed(0);
  const totalWin = wins.reduce((s, tr) => s + pnl(tr), 0), totalLoss = Math.abs(losses.reduce((s, tr) => s + pnl(tr), 0));
  document.getElementById('breakdown').innerHTML =
    `<div class="breakdown-bar">` +
    `<div class="bar-row"><span class="bar-label">${t('ana.win')}</span><span style="color:var(--green)">${wins.length} (${wPct}%)</span></div>` +
    `<div class="bar-track"><div class="bar-fill green" style="width:${wPct}%"></div></div>` +
    `<div class="bar-row"><span class="bar-label">${t('ana.loss')}</span><span style="color:var(--red)">${losses.length} (${lPct}%)</span></div>` +
    `<div class="bar-track"><div class="bar-fill red" style="width:${lPct}%"></div></div>` +
    `<div class="bar-row" style="margin-top:4px"><span class="bar-label">${t('ana.grossProfit')}</span><span style="color:var(--green)">${fmtNum(totalWin)}</span></div>` +
    `<div class="bar-row"><span class="bar-label">${t('ana.grossLoss')}</span><span style="color:var(--red)">-${fmtAbs(totalLoss)}</span></div>` +
    `</div>`;
  growBars(document.getElementById('breakdown'), 'breakdown');
}

function renderSymPerf() {
  const map = {}; getActiveTrades().forEach(tr => { map[tr.sym] = (map[tr.sym] || 0) + pnl(tr); });
  const sorted = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  document.getElementById('symPerf').innerHTML = sorted.length
    ? sorted.map(([sym, p]) => `<div class="sym-row"><span class="sym-name">${escHtml(sym)}</span><span class="sym-pnl ${p >= 0 ? 'pos' : 'neg'}">${fmtNum(p)}</span></div>`).join('')
    : `<div style="padding:16px 20px;color:var(--muted);font-family:var(--mono);font-size:11px">${t('ana.noData')}</div>`;
}

function renderStreak() {
  const sorted = [...getActiveTrades()].sort((a, b) => a.date.localeCompare(b.date));
  let streak = 0, streakType = null, best = 0, bestType = null, cur = 0, curType = null;
  sorted.forEach(tr => {
    const type = pnl(tr) > 0 ? 'win' : 'loss';
    if (type === curType) { cur++; } else { curType = type; cur = 1; }
    if (cur > best) { best = cur; bestType = type; }
    streak = cur; streakType = type;
  });
  const dots = sorted.slice(-20).map(tr =>
    `<div class="streak-dot ${pnl(tr) > 0 ? 'w' : 'l'}" title="${escHtml(tr.sym)} ${pnl(tr) > 0 ? '+' : ''}${pnl(tr).toFixed(0)}"></div>`
  ).join('');
  const curLabel = streakType === 'win' ? t('ana.curWinStreak') : streakType === 'loss' ? t('ana.curLossStreak') : t('ana.curStreak');
  const bestStr  = bestType ? t('ana.bestStreak', { n: best, type: t(bestType === 'win' ? 'ana.winsPlural' : 'ana.lossesPlural') }) : t('ana.bestStreak', { n: 0, type: '—' });
  document.getElementById('streakBlock').innerHTML =
    `<div class="streak-block">` +
    `<div class="streak-num ${streakType || ''}">${streak || 0}</div>` +
    `<div class="streak-label">${curLabel}</div>` +
    `<div class="streak-dots">${dots}</div>` +
    `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:12px">${bestStr}</div>` +
    `</div>`;
}

// ─── HEATMAP (CALENDAR MATRIX) ────────────────────────────────────────────────
let selectedHeatmapDate = null;

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

  // Month title in header (Gregorian year so 2026 stays consistent with trade dates)
  const titleEl = document.getElementById('heatmapMonthTitle');
  if (titleEl) {
    titleEl.textContent = getLang() === 'th'
      ? heatmapDate.toLocaleString('th-TH', { month: 'long', year: 'numeric', calendar: 'gregory' })
      : heatmapDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  }

  let html = `<div class="hmap-calendar-grid">`;
  // Day headers (Mon - Sun)
  const dayNames = t('hmap.days');
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
        pnlStr = `<span class="hmap-day-pnl pos">+${fmtAbs(Math.abs(val), 0)}<span class="hmap-usd"> USD</span></span>`;
      } else if (val < 0) {
        bg = isLight ? `rgba(220,38,38,${intensity.toFixed(2)})` : `rgba(255,69,96,${intensity.toFixed(2)})`;
        border = isLight ? `rgba(220,38,38,0.55)` : `rgba(255,69,96,0.55)`;
        pnlStr = `<span class="hmap-day-pnl neg">-${fmtAbs(Math.abs(val), 0)}<span class="hmap-usd"> USD</span></span>`;
      } else {
        bg = isLight ? `rgba(0,0,0,0.06)` : `rgba(255,255,255,0.08)`;
        pnlStr = `<span class="hmap-day-pnl zero">0<span class="hmap-usd"> USD</span></span>`;
      }
      dotsHtml = `<div class="hmap-day-dots">` + 
        info.trades.slice(0, 4).map(tr => `<div class="hmap-dot ${pnl(tr) > 0 ? 'win' : 'loss'}"></div>`).join('') +
        `</div>`;
    }

    const titleAttr = info 
      ? `${dateStr}: ${fmtNum(val)} (${count} ${t('hmap.tradesWord')}: ${info.wins}W / ${info.losses}L)`
      : dateStr;

    const isSelected = selectedHeatmapDate === dateStr;
    const selectedClass = isSelected ? ' selected' : '';
    const selectedBorder = isSelected ? (isLight ? '#0f172a' : '#ffffff') : border;

    html += `<div class="hmap-day-cell${selectedClass}" style="background:${bg};border-color:${selectedBorder};" onclick="filterByDate('${dateStr}')" title="${titleAttr}">
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
  if (selectedHeatmapDate === dateStr) {
    selectedHeatmapDate = null;
    toast(t('hmap.cleared'));
  } else {
    selectedHeatmapDate = dateStr;
    toast(t('hmap.filtered', { date: dateStr }));
  }
  renderHeatmap();
  renderRecentFeed();
  renderTable();
}

function clearHeatmapDateFilter() {
  selectedHeatmapDate = null;
  toast(t('hmap.showingAll'));
  renderHeatmap();
  renderRecentFeed();
  renderTable();
}

// ─── RECENT TRADES FEED (LIVE STREAM) ─────────────────────────────────────────
function renderRecentFeed() {
  const container = document.getElementById('recentTradesFeed');
  if (!container) return;
  const emptyEl = document.getElementById('emptyStateCompact');
  
  let list = getFiltered();
  let bannerHtml = '';

  if (selectedHeatmapDate) {
    const dayTrades = list.filter(tr => tr.date === selectedHeatmapDate);
    const dayPnl = dayTrades.reduce((acc, tr) => acc + pnl(tr), 0);
    const isPos = dayPnl >= 0;
    
    bannerHtml = `
      <div class="feed-active-date-banner">
        <div class="feed-date-info">
          <div class="feed-date-title">${selectedHeatmapDate}</div>
          <div class="feed-date-meta">
            <span>${dayTrades.length} ${t('hmap.tradesWord')}</span>
            <span class="feed-date-sep">•</span>
            <span class="feed-date-pnl ${isPos ? 'pos' : 'neg'}">${isPos ? '+' : ''}${fmtAbs(dayPnl)} USD</span>
          </div>
        </div>
        <button class="btn-clear-date-filter" onclick="clearHeatmapDateFilter()" title="${escHtml(t('trd.resetTitle'))}">${t('trd.resetBtn')}</button>
      </div>`;
    list = dayTrades;
  }

  if (!list.length) {
    const suffix = selectedHeatmapDate ? t('trd.emptyFeedDate', { date: selectedHeatmapDate }) : t('trd.emptyFeedFilter');
    container.innerHTML = bannerHtml + `<div class="feed-empty-sub">${t('trd.emptyFeed', { suffix })}</div>`;
    if (emptyEl) emptyEl.style.display = selectedHeatmapDate ? 'none' : 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // Take the most recent 15 trades (or all trades if filtered by date)
  const recent = selectedHeatmapDate ? list : list.slice(0, 15);
  container.innerHTML = bannerHtml + recent.map(tr => {
    const p = pnl(tr);
    const win = p > 0;
    const rVal = tr.actual_r == null ? NaN : Number(tr.actual_r);
    const rBadge = isNaN(rVal) ? ''
      : rVal > 0 ? `<span class="feed-r-badge pos">+${rVal.toFixed(2)}R</span>`
      : rVal < 0 ? `<span class="feed-r-badge neg">${rVal.toFixed(2)}R</span>`
      : `<span class="feed-r-badge">0.00R</span>`;

    return `<div class="feed-trade-item" onclick="openTradeDetails('${tr.id}')" title="${escHtml(t('trd.clickDetails', { sym: tr.sym }))}">
      <div class="feed-item-left">
        <span class="feed-sym-badge">${escHtml(tr.sym)}</span>
        <span class="feed-dir-pill ${tr.dir === 'Long' ? 'long' : 'short'}">${tr.dir === 'Long' ? '▲' : '▼'} ${escHtml(tr.dir.toUpperCase())}</span>
        <span class="feed-date-text">${escHtml(tr.date)}</span>
      </div>
      <div class="feed-item-right">
        <span class="feed-pnl-val ${win ? 'pos' : 'neg'}">${fmtNum(p)}</span>
        ${rBadge}
        <button class="btn-trade-dots" onclick="event.stopPropagation(); openTradeDetails('${tr.id}')" title="${escHtml(t('trd.orderDetailsTitle'))}">•••</button>
      </div>
    </div>`;
  }).join('');
}

// ─── VIEW SWITCHER & NAVIGATION ───────────────────────────────────────────────
function switchMainView(view, { scrollTop = true } = {}) {
  document.getElementById('mtabDash')?.classList.toggle('active', view !== 'journal');      // mobile tab bar
  document.getElementById('mtabJournal')?.classList.toggle('active', view === 'journal');
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
    enterView(journalView);
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    if (dashView) dashView.style.display = 'grid';
    if (journalView) journalView.style.display = 'none';
    if (btnDash) btnDash.classList.add('active');
    if (btnJournal) btnJournal.classList.remove('active');
    render();
    enterView(dashView);
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// "More" bottom sheet (mobile)
function toggleMoreSheet(force) {
  const sheet = document.getElementById('moreSheet'); if (!sheet) return;
  const open = typeof force === 'boolean' ? force : !sheet.classList.contains('open');
  sheet.classList.toggle('open', open);
  document.getElementById('moreSheetBackdrop')?.classList.toggle('open', open);
  const btn = document.getElementById('mtabMore');
  if (btn) { btn.classList.toggle('active', open); btn.setAttribute('aria-expanded', String(open)); }
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleMoreSheet(false); });

function scrollToBentoCard(cardId) {
  switchMainView('dashboard', { scrollTop: false });
  const el = document.getElementById(cardId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.borderColor = 'var(--accent)';
    setTimeout(() => {
      el.style.borderColor = '';
    }, 1500);
  }
}

// ─── CARD EXPAND / FULLSCREEN EXTEND ─────────────────────────────────────────
function toggleExpandCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const isExpanded = card.classList.contains('is-expanded');
  
  // Close any already open expanded card
  closeAllExpandedCards();

  let backdrop = document.getElementById('cardExpandBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'cardExpandBackdrop';
    backdrop.className = 'card-expand-backdrop';
    backdrop.onclick = closeAllExpandedCards;
    const parent = document.getElementById('appWrapper') || document.body;
    parent.appendChild(backdrop);
  }

  if (!isExpanded) {
    card.classList.add('is-expanded');
    document.body.classList.add('card-modal-open');
    backdrop.classList.add('active');
    card.scrollTop = 0;
    
    if (cardId === 'cardEquity') {
      setTimeout(drawEquity, 100);
    } else if (cardId === 'cardAccounts') {
      if (typeof renderExtendedPortfolios === 'function') renderExtendedPortfolios();
    } else if (cardId === 'cardTrades') {
      renderExtendedTradesTable();
    }
    toast(t('trd.extModeToast'));
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
    setTimeout(drawEquity, 100);
  }
}

// ─── EXTENDED TRADES TABLE RENDERER ──────────────────────────────────────────
function renderExtendedTradesTable() {
  const container = document.getElementById('extendedTradesTable');
  if (!container) return;
  const list = getFiltered();
  
  if (!list.length) {
    container.innerHTML = `<div class="feed-empty-sub" style="padding:48px;text-align:center">${t('trd.emptyExt')}</div>`;
    return;
  }

  const rows = list.map(tr => {
    const p = pnl(tr);
    const win = p > 0;
    const rVal = tr.actual_r == null ? NaN : Number(tr.actual_r);
    const rText = isNaN(rVal) ? '—' : `${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}R`;
    const rClass = isNaN(rVal) ? '' : (rVal >= 0 ? 'pos' : 'neg');

    return `
      <tr>
        <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${escHtml(tr.date)}</td>
        <td style="font-weight:800;font-size:13px">${escHtml(tr.sym)}</td>
        <td><span class="feed-dir-pill ${tr.dir === 'Long' ? 'long' : 'short'}">${tr.dir === 'Long' ? '▲' : '▼'} ${escHtml(tr.dir.toUpperCase())}</span></td>
        <td style="font-family:var(--mono);">${fmtNum(tr.entry_price ?? tr.entry)}</td>
        <td style="font-family:var(--mono);">${fmtNum(tr.exit_price ?? tr.exit)}</td>
        <td style="font-family:var(--mono);">${tr.size}</td>
        <td style="font-family:var(--mono);font-weight:800;" class="${win ? 'pos' : 'neg'}">${p >= 0 ? '+' : ''}${fmtAbs(p)} USD</td>
        <td style="font-family:var(--mono);" class="${p >= 0 ? 'pos' : 'neg'}">${pnlPct(tr).toFixed(2)}%</td>
        <td style="font-family:var(--mono);" class="${rClass}">${rText}</td>
        <td><span style="font-size:11px;color:var(--muted)">${escHtml(tr.note || tr.setup || '—')}</span></td>
        <td><span class="tag-pill">${escHtml(tr.tag || t('trd.noTag'))}</span></td>
        <td style="text-align:right">
          <button class="btn-trade-dots" onclick="openTradeDetails('${tr.id}')" title="${escHtml(t('trd.inspectTitle'))}">${t('trd.inspectBtn')}</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table class="trade-table" style="width:100%">
      <thead>
        <tr>
          <th>${t('col.date')}</th>
          <th>${t('col.sym')}</th>
          <th>${t('col.dir')}</th>
          <th>${t('col.entry')}</th>
          <th>${t('col.exit')}</th>
          <th>${t('col.size')}</th>
          <th>${t('col.pnlUsd')}</th>
          <th>${t('col.returnPct')}</th>
          <th>${t('col.r')}</th>
          <th>${t('col.setup')}</th>
          <th>${t('col.tag')}</th>
          <th style="text-align:right">${t('col.action')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ─── ORDER DETAILS INSPECTOR MODAL ────────────────────────────────────────────
let activeDetailTradeId = null;

function openTradeDetails(tradeId) {
  const trades = getActiveTrades();
  const tr = trades.find(x => x.id === tradeId);
  if (!tr) return;
  activeDetailTradeId = tradeId;

  const p = pnl(tr);
  const pct = pnlPct(tr);
  const win = p > 0;
  const isZero = p === 0;

  // Header
  const dtlSym = document.getElementById('dtlSym');
  if (dtlSym) dtlSym.textContent = tr.sym;
  const dtlDir = document.getElementById('dtlDir');
  if (dtlDir) {
    dtlDir.className = `feed-dir-pill ${tr.dir === 'Long' ? 'long' : 'short'}`;
    dtlDir.textContent = (tr.dir === 'Long' ? '▲ LONG' : '▼ SHORT');
  }

  // P&L Hero
  const dtlPnlNum = document.getElementById('dtlPnlNum');
  if (dtlPnlNum) {
    dtlPnlNum.textContent = `${p >= 0 ? '+' : ''}${fmtAbs(p)} USD`;
    dtlPnlNum.className = `dtl-pnl-num ${win ? 'pos' : (isZero ? '' : 'neg')}`;
  }
  const dtlPnlSub = document.getElementById('dtlPnlSub');
  if (dtlPnlSub) {
    const rText = tr.actual_r != null && !isNaN(tr.actual_r) ? `${Number(tr.actual_r).toFixed(2)}R` : '— R';
    dtlPnlSub.textContent = t('dtl.returnR', { pct: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`, r: rText });
  }

  // Grid items
  const setEl = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text || '—';
  };
  setEl('dtlDate', tr.date);
  setEl('dtlSize', `${tr.size} ${t('trd.units')}`);
  setEl('dtlEntry', fmtNum(tr.entry_price ?? tr.entry));
  setEl('dtlExit', fmtNum(tr.exit_price ?? tr.exit));
  setEl('dtlSl', (tr.stop_loss ?? tr.sl) ? fmtNum(tr.stop_loss ?? tr.sl) : t('common.none'));
  setEl('dtlTp', (tr.take_profit ?? tr.tp) ? fmtNum(tr.take_profit ?? tr.tp) : t('common.none'));
  setEl('dtlR', tr.actual_r != null ? `${Number(tr.actual_r).toFixed(2)}R` : '—');
  setEl('dtlTag', tr.tag || t('trd.noTag'));
  setEl('dtlNote', tr.note ? tr.note : t('trd.noNote'));

  const overlay = document.getElementById('tradeDetailsOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeTradeDetails(e) {
  if (e && e.target !== e.currentTarget) return;
  closeTradeDetailsDirect();
}

function closeTradeDetailsDirect() {
  const overlay = document.getElementById('tradeDetailsOverlay');
  if (overlay) overlay.classList.remove('open');
  activeDetailTradeId = null;
}

function editFromDetails() {
  const id = activeDetailTradeId;
  closeTradeDetailsDirect();
  if (id) editTrade(id);
}

async function deleteFromDetails() {
  const id = activeDetailTradeId;
  if (!id) return;
  closeTradeDetailsDirect();
  await delTrade(id);
}

// ─── BENTO MOUSE INTERACTION & ANIMATIONS ────────────────────────────────────
