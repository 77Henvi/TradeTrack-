// ─── SYMBOL PRESET ────────────────────────────────────────────────────────────
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
  updatePreview();
}

// ─── TRADE MODAL OPEN / CLOSE ─────────────────────────────────────────────────
function openModal() {
  editingId = null;
  document.querySelector('.modal-title').textContent = "NEW TRADE ENTRY";
  document.querySelector('.modal-footer .btn-accent').textContent = "SAVE TRADE ▸";
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);

  ['f-entry','f-exit','f-size','f-sl','f-tp'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  if (document.getElementById('f-note')) document.getElementById('f-note').value = '';

  const sel = document.getElementById('f-sym-select');
  const custom = document.getElementById('f-sym-custom');
  if (sel) {
    sel.value = 'XAUUSD';
    if (custom) custom.style.display = 'none';
    applySymbolPreset();
  }

  selectedTag = ''; document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('selected'));
  setDir('Long');

  // แสดง balance ของพอร์ตปัจจุบันใน read-only field
  const dispEl = document.getElementById('f-account-display');
  if (dispEl) {
    const bal = getActivePortfolio()?.balance || 0;
    dispEl.textContent = bal ? `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
  }

  updatePreview();
  setTimeout(() => document.getElementById('f-entry')?.focus(), 100);
}

function editTrade(id) {
  const t = getActiveTrades().find(x => x.id === id); if (!t) return;
  editingId = id;
  document.querySelector('.modal-title').textContent = "EDIT TRADE";
  document.getElementById('modalOverlay').classList.add('open');

  document.getElementById('f-date').value  = t.date;
  document.getElementById('f-entry').value = t.entry_price || t.entry;
  document.getElementById('f-exit').value  = t.exit_price  || t.exit;
  document.getElementById('f-size').value  = t.size;
  document.getElementById('f-sl').value    = t.stop_loss ?? '';
  document.getElementById('f-tp').value    = t.take_profit ?? '';

  const sel = document.getElementById('f-sym-select');
  const custom = document.getElementById('f-sym-custom');
  const hint = document.getElementById('sym-hint');
  if (sel && custom) {
    if (SYMBOL_PRESETS[t.sym]) {
      sel.value = t.sym; custom.style.display = 'none';
      if (hint) hint.textContent = `Contract size: ${SYMBOL_PRESETS[t.sym].label}`;
    } else {
      sel.value = 'OTHER'; custom.style.display = 'block'; custom.value = t.sym;
      if (hint) hint.textContent = '';
    }
  }

  if (document.getElementById('f-mult')) document.getElementById('f-mult').value = t.multiplier || 1;
  if (document.getElementById('f-note')) document.getElementById('f-note').value = t.note || '';

  // แสดง balance พอร์ตใน read-only field
  const dispEl = document.getElementById('f-account-display');
  if (dispEl) {
    const bal = getActivePortfolio()?.balance || 0;
    dispEl.textContent = bal ? `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—';
  }

  setDir(t.dir); selectedTag = t.tag || '';
  document.querySelectorAll('.tag-btn').forEach(b => {
    b.textContent.trim().toUpperCase() === selectedTag.toUpperCase()
      ? b.classList.add('selected') : b.classList.remove('selected');
  });
  updatePreview();
}

function closeModal(e) { if (e.target === document.getElementById('modalOverlay')) closeModalDirect(); }
function closeModalDirect() { document.getElementById('modalOverlay').classList.remove('open'); }

// ─── FORM CONTROLS ────────────────────────────────────────────────────────────
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

// ─── R-MULTIPLE HELPERS ───────────────────────────────────────────────────────
// risk per unit = distance from entry to stop (must be > 0 to be valid)
function calcRiskPerUnit(dir, entry, sl) { return dir === 'Long' ? entry - sl : sl - entry; }
function calcActualR(dir, entry, exit, riskPerUnit) {
  return (dir === 'Long' ? exit - entry : entry - exit) / riskPerUnit;
}
function fmtR(r) { return (r >= 0 ? '+' : '') + r.toFixed(2) + 'R'; }

// ─── LIVE P&L PREVIEW ─────────────────────────────────────────────────────────
function updatePreview() {
  const entry = parseFloat(document.getElementById('f-entry')?.value);
  const exit  = parseFloat(document.getElementById('f-exit')?.value);
  const size  = parseFloat(document.getElementById('f-size')?.value);
  const sl    = parseFloat(document.getElementById('f-sl')?.value);
  const mult  = parseFloat(document.getElementById('f-mult')?.value) || 1;
  // ดึง balance จากพอร์ตที่ active แทนการให้ user กรอก
  const acc   = getActivePortfolio()?.balance || 0;
  const pv    = document.getElementById('previewVal');
  const pr    = document.getElementById('previewRR');
  const lines = [];

  if (!isNaN(entry) && !isNaN(exit) && !isNaN(size) && size > 0) {
    const diff = selectedDir === 'Long' ? exit - entry : entry - exit;
    const p = diff * size * mult;
    if (pv) { pv.textContent = fmtNum(p); pv.className = 'preview-val ' + (p >= 0 ? 'pos' : 'neg'); }

    const points = Math.abs(diff);
    let prText = `ระยะ: ${points % 1 !== 0 ? points.toFixed(3) : points} Points`;
    if (mult !== 1) prText += ` · x${mult}`;
    if (!isNaN(acc) && acc > 0) {
      const accPct = (p / acc * 100).toFixed(2);
      prText += ` <br><span style="color:${p >= 0 ? 'var(--green)' : 'var(--red)'}">บัญชีโต: ${(p >= 0 ? '+' : '')}${accPct}%</span>`;
    }
    lines.push(prText);
  } else if (pv) {
    pv.textContent = '—'; pv.className = 'preview-val';
  }

  // Risk + Actual R (only when a stop loss is entered)
  if (!isNaN(sl) && !isNaN(entry)) {
    const rpu = calcRiskPerUnit(selectedDir, entry, sl);
    if (rpu <= 0) {
      lines.push(`<span style="color:var(--red)">SL must be ${selectedDir === 'Long' ? 'below' : 'above'} entry for a ${selectedDir}</span>`);
    } else {
      if (!isNaN(size) && size > 0) {
        const dollarRisk = rpu * size * mult;
        let riskText = `Risk: $${fmtAbs(dollarRisk)}`;
        if (acc > 0) riskText += ` (${(dollarRisk / acc * 100).toFixed(2)}% of Port)`;
        lines.push(riskText);
      }
      if (!isNaN(exit)) {
        const r = calcActualR(selectedDir, entry, exit, rpu);
        lines.push(`<span style="color:${r >= 0 ? 'var(--green)' : 'var(--red)'}">Actual R: ${fmtR(r)}</span>`);
      }
    }
  }

  if (pr) pr.innerHTML = lines.join('<br>');
}

// ─── SAVE / DELETE TRADE ──────────────────────────────────────────────────────
async function saveTrade() {
  const portfolio = getActivePortfolio();
  if (!portfolio) { toast('ไม่มีพอร์ต — สร้างพอร์ตก่อน', 'error'); return; }

  const selVal  = document.getElementById('f-sym-select')?.value;
  const rawSym  = (selVal === 'OTHER') ? document.getElementById('f-sym-custom')?.value : selVal;
  const sym     = (rawSym || '').trim().toUpperCase();

  const date       = document.getElementById('f-date').value;
  const entry      = parseFloat(document.getElementById('f-entry').value);
  const exit       = parseFloat(document.getElementById('f-exit').value);
  const size       = parseFloat(document.getElementById('f-size').value);
  const multiplier = document.getElementById('f-mult') ? (parseFloat(document.getElementById('f-mult').value) || 1) : 1;
  const note       = document.getElementById('f-note') ? document.getElementById('f-note').value.trim() : '';
  // ใช้ balance ของพอร์ตแทน field account ที่ user กรอก
  const account    = portfolio.balance || 0;

  if (!sym || !date || isNaN(entry) || isNaN(exit) || isNaN(size)) { toast('Fill in all required fields', 'error'); return; }

  // optional SL / TP → actual R
  const slVal = parseFloat(document.getElementById('f-sl')?.value);
  const tpVal = parseFloat(document.getElementById('f-tp')?.value);
  const stop_loss   = Number.isFinite(slVal) ? slVal : null;
  const take_profit = Number.isFinite(tpVal) ? tpVal : null;
  let actual_r = null;
  if (stop_loss !== null) {
    const rpu = calcRiskPerUnit(selectedDir, entry, stop_loss);
    if (rpu <= 0) {
      toast(`Stop loss must be ${selectedDir === 'Long' ? 'below' : 'above'} entry for a ${selectedDir}`, 'error');
      return;
    }
    actual_r = calcActualR(selectedDir, entry, exit, rpu);
  }

  const tradeData = { date, sym, dir: selectedDir, entry, exit, size, multiplier, note, tag: selectedTag, account, stop_loss, take_profit, actual_r };

  if (editingId !== null) {
    const ok = await dbUpdateTrade(editingId, tradeData); if (!ok) return;
    const idx = portfolio.trades.findIndex(t => t.id === editingId);
    if (idx > -1) portfolio.trades[idx] = {
      ...portfolio.trades[idx],
      date, sym, dir: selectedDir,
      entry_price: entry, exit_price: exit,
      size, multiplier, note, tag: selectedTag, account,
      stop_loss, take_profit, actual_r
    };
    toast('Trade updated ✓');
  } else {
    const saved = await dbSaveTrade(portfolio.id, tradeData); if (!saved) return;
    portfolio.trades.push(saved); toast('Trade saved ✓');
  }

  render(); closeModalDirect();
}

async function delTrade(id) {
  if (!await confirmDialog('ลบ trade นี้?')) return;
  const p = getActivePortfolio(); if (!p) return;
  const ok = await dbDeleteTrade(id); if (!ok) return;
  p.trades = p.trades.filter(t => t.id !== id); render(); toast('Trade deleted', 'error');
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportCSV() {
  const header = 'Date,Symbol,Direction,Entry,Exit,Size,Multiplier,PnL,PnL%,Setup,Tag';
  const rows = getFiltered().map(t => [
    t.date, t.sym, t.dir, t.entry_price, t.exit_price, t.size, (t.multiplier || 1),
    pnl(t).toFixed(2), pnlPct(t).toFixed(2) + '%',
    `"${(t.note || '').replace(/"/g, '""')}"`, t.tag || ''
  ].join(','));
  const url = URL.createObjectURL(new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${getActivePortfolio()?.name || 'tradelog'}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click(); URL.revokeObjectURL(url); toast('CSV exported ↓');
}
function exportNotion() {
  const header = 'Date\tSymbol\tDirection\tEntry\tExit\tSize\tMult\tP&L\tP&L%\tResult\tSetup\tTag';
  const rows = getFiltered().map(t => [
    t.date, t.sym, t.dir, t.entry_price, t.exit_price, t.size, (t.multiplier || 1),
    (pnl(t) >= 0 ? '+' : '') + pnl(t).toFixed(2),
    (pnlPct(t) >= 0 ? '+' : '') + pnlPct(t).toFixed(2) + '%',
    pnl(t) > 0 ? 'Win' : 'Loss', t.note || '', t.tag || ''
  ].join('\t'));
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
    if (msg) { msg.style.opacity = 1; setTimeout(() => msg.style.opacity = 0, 2000); }
    toast('Copied to clipboard ✓');
  }).catch(() => toast('Copy failed — select all and copy manually', 'error'));
}
