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
      setTimeout(drawEquity, 50);
    });
  }

  document.getElementById('searchInput')?.addEventListener('input', () => { currentPage = 1; renderTable(); });

  ['f-entry','f-exit','f-size','f-mult'].forEach(id => {
    const el = document.getElementById(id); if (el) el.addEventListener('input', updatePreview);
  });
}

// ─── GLOBAL KEYBOARD SHORTCUTS ────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModalDirect();
    document.getElementById('notionOverlay')?.classList.remove('open');
    document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
    document.getElementById('portfolioSettingsOverlay')?.classList.remove('open');
    document.getElementById('newPortfolioOverlay')?.classList.remove('open');
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); openModal(); }
});

// ─── RENDER ALL ───────────────────────────────────────────────────────────────
function render() { drawEquity(); renderMetrics(); renderTable(); renderBreakdown(); renderSymPerf(); renderStreak(); renderHeatmap(); }

// ─── EQUITY CURVE ─────────────────────────────────────────────────────────────
function drawEquity() {
  const trades = getActiveTrades(), canvas = document.getElementById('equityCanvas'); if (!canvas) return;
  const dpr = window.devicePixelRatio || 1, W = canvas.offsetWidth; if (W === 0) return;
  canvas.width = W * dpr; canvas.height = 120 * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
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

  let peak = points[0], maxDD = 0;
  points.forEach(p => { if (p > peak) peak = p; const dd = peak - p; if (dd > maxDD) maxDD = dd; });
  const wins = trades.filter(t => pnl(t) > 0), wr = trades.length ? (wins.length / trades.length * 100) : 0;
  document.getElementById('equityStats').innerHTML =
    `<div class="equity-stat"><div class="el">TOTAL P&L</div><div class="ev ${running >= 0 ? 'pos' : 'neg'}">${fmtNum(running)}</div></div>` +
    `<div class="equity-stat"><div class="el">WIN RATE</div><div class="ev ${wr >= 50 ? 'pos' : 'neg'}">${wr.toFixed(1)}%</div></div>` +
    `<div class="equity-stat"><div class="el">MAX DRAWDOWN</div><div class="ev neg">${fmtNum(-Math.abs(maxDD))}</div></div>` +
    `<div class="equity-stat"><div class="el">TRADES</div><div class="ev">${trades.length}</div></div>`;
}
window.addEventListener('resize', drawEquity);

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
  document.getElementById('metricsRow').innerHTML = metrics.map(m =>
    `<div class="metric-card"><div class="mc-label">${m.label}</div><div class="mc-val ${m.cls}">${m.val}</div><div class="mc-sub">${m.sub}</div></div>`
  ).join('');
}

// ─── TABLE + PAGINATION ───────────────────────────────────────────────────────
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
    .filter(t => !search || t.sym.includes(search) || (t.note || '').toUpperCase().includes(search) || (t.tag || '').toUpperCase().includes(search))
    .sort((a, b) => {
      const k  = currentSort.key;
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

  // คำนวณ running balance ณ แต่ละ trade (เรียง date ก่อน)
  const portfolio = getActivePortfolio();
  const startBal  = portfolio?.balance || 0;
  // สร้าง map: tradeId → balance หลัง trade นั้น (sort by date ascending)
  const allSorted = [...getActiveTrades()].sort((a, b) => a.date.localeCompare(b.date));
  const runningBalMap = {};
  let runBal = startBal;
  allSorted.forEach(t => { runBal += pnl(t); runningBalMap[t.id] = runBal; });

  tbody.innerHTML = rowsToRender.map((t, idx) => {
    const p = pnl(t), pp = pnlPct(t), win = p > 0;
    const curBal    = runningBalMap[t.id] ?? 0;
    const balColor  = curBal >= startBal ? 'var(--green)' : 'var(--red)';
    const multStr   = (t.multiplier && t.multiplier !== 1) ? `<br><span style="font-size:9px;color:var(--muted)">x${t.multiplier}</span>` : '';
    const balStr    = startBal > 0
      ? `<br><span style="font-size:10px;color:${balColor}" title="Balance after trade">$${fmtAbs(curBal, 0)}</span>`
      : '';
    return `<tr class="row-enter ${win ? 'row-win' : 'row-loss'}" style="animation-delay:${idx * 0.02}s">
      <td style="font-family:var(--mono);font-size:11px;color:var(--muted)">${t.date}</td>
      <td style="font-weight:700;letter-spacing:1px;font-family:var(--mono)">${t.sym}</td>
      <td><span class="dir-tag ${t.dir === 'Long' ? 'long' : 'short'}">${t.dir === 'Long' ? '▲' : '▼'} ${t.dir.toUpperCase()}</span></td>
      <td style="font-family:var(--mono);font-size:12px">${t.entry_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.exit_price.toLocaleString()}</td>
      <td style="font-family:var(--mono);font-size:12px">${t.size}${multStr}</td>
      <td><span class="pnl-cell ${win ? 'pos' : 'neg'}">${fmtNum(p)}</span></td>
      <td style="font-family:var(--mono);font-size:11px;color:${win ? 'var(--green)' : 'var(--red)'}">${(pp >= 0 ? '+' : '') + pp.toFixed(2)}%${balStr}</td>
      <td style="color:var(--muted);font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis" class="col-setup">${t.note || '—'}</td>
      <td class="col-tag">${t.tag ? `<span class="tag-pill">${t.tag}</span>` : ''}</td>
      <td style="display:flex;gap:8px;">
        <button class="del-btn" style="color:var(--blue)" onclick="editTrade('${t.id}')" title="Edit">✏️</button>
        <button class="del-btn" onclick="delTrade('${t.id}')" title="Delete">✕</button>
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
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
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
    ? sorted.map(([sym, p]) => `<div class="sym-row"><span class="sym-name">${sym}</span><span class="sym-pnl ${p >= 0 ? 'pos' : 'neg'}">${fmtNum(p)}</span></div>`).join('')
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
    `<div class="streak-dot ${pnl(t) > 0 ? 'w' : 'l'}" title="${t.sym} ${pnl(t) > 0 ? '+' : ''}${pnl(t).toFixed(0)}"></div>`
  ).join('');
  document.getElementById('streakBlock').innerHTML =
    `<div class="streak-block">` +
    `<div class="streak-num ${streakType || ''}">${streak || 0}</div>` +
    `<div class="streak-label">CURRENT ${streakType ? streakType.toUpperCase() + ' STREAK' : 'STREAK'}</div>` +
    `<div class="streak-dots">${dots}</div>` +
    `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:12px">BEST: ${best} ${bestType ? bestType.toUpperCase() + 'S' : '—'}</div>` +
    `</div>`;
}

// ─── HEATMAP ──────────────────────────────────────────────────────────────────
function changeHeatmapMonth(offset) {
  heatmapDate = new Date(heatmapDate.getFullYear(), heatmapDate.getMonth() + offset, 1); renderHeatmap();
}
function renderHeatmap() {
  const isLight = document.documentElement.classList.contains('light');
  const emptyBg = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
  const pnlByDate = {}; getActiveTrades().forEach(t => { pnlByDate[t.date] = (pnlByDate[t.date] || 0) + pnl(t); });
  const year = heatmapDate.getFullYear(), month = heatmapDate.getMonth();
  const startDow = new Date(year, month, 1).getDay(), daysInMonth = new Date(year, month + 1, 0).getDate();
  const vals = Object.values(pnlByDate).filter(v => v !== 0), maxAbs = vals.length ? Math.max(...vals.map(Math.abs)) : 1;

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += `<div class="hmap-cell" style="background:transparent"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, val = pnlByDate[dateStr] || 0;
    const bg = val === 0 ? emptyBg
      : val > 0 ? `rgba(60,255,160,${Math.min(0.9, 0.15 + (val / maxAbs) * 0.75).toFixed(2)})`
      : `rgba(255,69,96,${Math.min(0.9, 0.15 + (Math.abs(val) / maxAbs) * 0.75).toFixed(2)})`;
    cells += `<div class="hmap-cell" style="background:${bg}" title="${val !== 0 ? dateStr + ': ' + fmtNum(val) : dateStr}"></div>`;
  }

  document.getElementById('heatmap').innerHTML =
    `<div class="hmap-label">${['S','M','T','W','T','F','S'].map(d => `<div class="hmap-day-label">${d}</div>`).join('')}</div>` +
    `<div class="heatmap-grid">${cells}</div>` +
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:0 20px 12px;">` +
    `<button class="btn-ghost" style="padding:2px 8px;font-size:10px" onclick="changeHeatmapMonth(-1)">◀</button>` +
    `<div style="font-family:var(--mono);font-size:10px;color:var(--muted);letter-spacing:1px">${heatmapDate.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}</div>` +
    `<button class="btn-ghost" style="padding:2px 8px;font-size:10px" onclick="changeHeatmapMonth(1)">▶</button>` +
    `</div>`;
}
