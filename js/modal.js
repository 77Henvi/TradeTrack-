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

// ─── CSV IMPORT ───────────────────────────────────────────────────────────────
const IMPORT_MAX_ROWS  = 5000;
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const IMPORT_CHUNK     = 50;
const IMPORT_TAGS      = ['Scalp', 'Swing', 'Position', 'News', 'Breakout', 'Reversal'];

// Header aliases, compared after lower-casing and stripping everything except a-z 0-9 "/".
// Earlier alias in the list wins when a file has several matching columns.
const CSV_ALIASES = {
  date:        ['date', 'opentime', 'opendate', 'datetime', 'entrydate', 'time'],
  sym:         ['symbol', 'sym', 'ticker', 'instrument'],
  dir:         ['direction', 'dir', 'type', 'side'],
  entry_price: ['entry', 'entryprice', 'openprice', 'open'],
  exit_price:  ['exit', 'exitprice', 'closeprice', 'close'],
  size:        ['size', 'lots', 'lot', 'volume', 'qty', 'quantity'],
  stop_loss:   ['stoploss', 'sl', 's/l'],
  take_profit: ['takeprofit', 'tp', 't/p'],
  multiplier:  ['multiplier', 'mult'],
  note:        ['note', 'notes', 'setup', 'comment', 'comments'],
  tag:         ['tag'],
};
const CSV_REQUIRED = { date: 'date', sym: 'symbol', dir: 'direction', entry_price: 'entry', exit_price: 'exit' };

const csvKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9\/]/g, '');
const csvText = (s, max) => String(s ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);

// RFC-4180-ish splitter: quoted fields, "" escapes, delimiters/newlines inside quotes.
// Returns { rows, lines } where lines[i] is the 1-based physical line row i starts on.
function csvSplit(text, delim) {
  const rows = [], lines = [];
  let row = [], field = '', inQ = false, line = 1, rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') line++;
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"' && field.trim() === '') { inQ = true; field = ''; }
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); lines.push(rowLine); row = []; field = ''; rowLine = line; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); lines.push(rowLine); }
  return { rows, lines };
}
function csvDetectDelimiter(text) {
  const first = text.split('\n').find(l => l.trim() !== '') || '';
  let best = ',', bestN = 0;
  for (const d of [',', ';', '\t']) { const n = first.split(d).length - 1; if (n > bestN) { best = d; bestN = n; } }
  return best;
}

// "1,234.50" · "1.234,50" · "1234,5" · "$ 12" → number, anything else → null
function parseCsvNum(raw) {
  let s = String(raw ?? '').replace(/[\s\u00A0$€£฿]/g, '');
  if (s === '') return null;
  const lastC = s.lastIndexOf(','), lastD = s.lastIndexOf('.');
  if (lastC > -1 && lastD > -1) s = lastC > lastD ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lastC > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const CSV_DMY_RE = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})(?!\d)/;
const CSV_ISO_RE = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/;

// → "YYYY-MM-DD" or null. Handles 2024-03-15, 2024.03.15 10:30 (MT4), 15/03/2024, 03/15/2024, "Mar 15, 2024".
function parseCsvDate(raw, dayFirst = true) {
  const s = String(raw ?? '').trim(); if (!s) return null;
  let y, m, d, mt;
  if ((mt = s.match(CSV_ISO_RE))) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }
  else if ((mt = s.match(CSV_DMY_RE))) {
    const a = +mt[1], b = +mt[2]; y = +mt[3]; if (mt[3].length === 2) y += 2000;
    if (a > 12) { d = a; m = b; } else if (b > 12) { m = a; d = b; }
    else if (dayFirst) { d = a; m = b; } else { m = a; d = b; }
  } else {
    const dt = new Date(s); if (isNaN(dt)) return null;
    y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
  }
  if (y > 2400) y -= 543;                                   // Buddhist-era year (e.g. Thai Excel locale)
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
  const chk = new Date(y, m - 1, d);
  if (chk.getFullYear() !== y || chk.getMonth() !== m - 1 || chk.getDate() !== d) return null;   // e.g. 31 Feb
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
function csvDir(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s.startsWith('buy')  || s.startsWith('long'))  return 'Long';
  if (s.startsWith('sell') || s.startsWith('short')) return 'Short';
  return null;
}

/**
 * Parse CSV text into trades ready for insert (DB column names).
 * Never throws. Returns:
 *   { trades, errors:[{line,reason}], warnings:[string], fatal:string|null }
 */
function parseCSV(text) {
  const out = { trades: [], errors: [], warnings: [], fatal: null };
  const src = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!src.trim()) { out.fatal = 'The file is empty.'; return out; }

  const { rows: rawRows, lines: rawLines } = csvSplit(src, csvDetectDelimiter(src));
  const rows = [], lines = [];
  rawRows.forEach((r, i) => { if (r.some(c => String(c).trim() !== '')) { rows.push(r); lines.push(rawLines[i]); } });
  if (rows.length < 2) { out.fatal = 'No data rows found — the file needs a header row and at least one trade.'; return out; }
  if (rows.length - 1 > IMPORT_MAX_ROWS) { out.fatal = `Too many rows (${rows.length - 1}). Maximum is ${IMPORT_MAX_ROWS} per import — split the file.`; return out; }

  const header = rows[0].map(csvKey), idx = {};
  for (const [field, aliases] of Object.entries(CSV_ALIASES)) {
    for (const a of aliases) { const i = header.indexOf(a); if (i > -1) { idx[field] = i; break; } }
  }
  const missing = Object.keys(CSV_REQUIRED).filter(f => idx[f] === undefined).map(f => CSV_REQUIRED[f]);
  if (missing.length) { out.fatal = `Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`; return out; }

  const cell = (r, f) => idx[f] === undefined ? '' : String(r[idx[f]] ?? '').trim();

  // 15/03 vs 03/15: decide the day/month order once per file when some date makes it unambiguous
  let sawDayFirst = false, sawMonthFirst = false;
  rows.slice(1).forEach(r => {
    const m = cell(r, 'date').match(CSV_DMY_RE); if (!m) return;
    if (+m[1] > 12) sawDayFirst = true; else if (+m[2] > 12) sawMonthFirst = true;
  });
  const dayFirst = !(sawMonthFirst && !sawDayFirst);
  let ambiguous = 0, wrongSideSL = 0;

  rows.slice(1).forEach((r, k) => {
    const line = lines[k + 1], fail = reason => out.errors.push({ line, reason });

    const rawDate = cell(r, 'date'), date = parseCsvDate(rawDate, dayFirst);
    if (!date) return fail(`invalid date "${csvText(rawDate, 20)}"`);
    const dm = rawDate.match(CSV_DMY_RE); if (dm && +dm[1] <= 12 && +dm[2] <= 12 && dm[1] !== dm[2]) ambiguous++;

    const sym = csvText(cell(r, 'sym'), 20).toUpperCase();
    if (!sym) return fail('missing symbol');

    const dir = csvDir(cell(r, 'dir'));
    if (!dir) return fail(`unrecognized direction "${csvText(cell(r, 'dir'), 20)}"`);

    const entry = parseCsvNum(cell(r, 'entry_price')), exit = parseCsvNum(cell(r, 'exit_price'));
    if (entry === null || entry === 0) return fail('invalid entry price');
    if (exit === null) return fail('invalid exit price');

    const sizeRaw = cell(r, 'size'), size = sizeRaw === '' ? 1 : parseCsvNum(sizeRaw);
    if (size === null || size <= 0) return fail(`invalid size "${csvText(sizeRaw, 20)}"`);
    const multRaw = cell(r, 'multiplier'), multiplier = multRaw === '' ? 1 : parseCsvNum(multRaw);
    if (multiplier === null || multiplier <= 0) return fail(`invalid multiplier "${csvText(multRaw, 20)}"`);

    // brokers export 0 for "no SL / no TP"
    let sl = parseCsvNum(cell(r, 'stop_loss')); if (sl !== null && sl <= 0) sl = null;
    let tp = parseCsvNum(cell(r, 'take_profit')); if (tp !== null && tp <= 0) tp = null;

    let actual_r = null;
    if (sl !== null) {
      const rpu = calcRiskPerUnit(dir, entry, sl);
      if (rpu > 0) actual_r = calcActualR(dir, entry, exit, rpu); else wrongSideSL++;
    }

    const tagRaw = csvText(cell(r, 'tag'), 30);
    const tag = IMPORT_TAGS.find(t => t.toLowerCase() === tagRaw.toLowerCase()) || tagRaw;

    out.trades.push({
      date, sym, dir, entry_price: entry, exit_price: exit, size, multiplier,
      note: csvText(cell(r, 'note'), 500), tag, stop_loss: sl, take_profit: tp, actual_r,
    });
  });

  if (ambiguous) out.warnings.push(`${ambiguous} date${ambiguous > 1 ? 's were' : ' was'} ambiguous (e.g. 03/04/2024) and read as ${dayFirst ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}.`);
  if (wrongSideSL) out.warnings.push(`${wrongSideSL} trade${wrongSideSL > 1 ? 's have' : ' has'} a stop loss on the wrong side of entry — imported without an R value.`);
  return out;
}

// ─── IMPORT MODAL ─────────────────────────────────────────────────────────────
let importState = null;     // result of parseCSV for the loaded file
let importBusy  = false;

const $imp = id => document.getElementById(id);

function openImportModal() {
  if (!getActivePortfolio()) { toast('ไม่มีพอร์ต — สร้างพอร์ตก่อน', 'error'); return; }
  resetImportModal();
  $imp('importModalOverlay').classList.add('open');
}
function closeImportModal(e) { if (e.target === $imp('importModalOverlay')) closeImportModalDirect(); }
function closeImportModalDirect() {
  if (importBusy) return;                       // never close mid-import
  $imp('importModalOverlay')?.classList.remove('open');
  resetImportModal();
}
function resetImportModal() {
  importState = null;
  if ($imp('importFile')) $imp('importFile').value = '';
  if ($imp('importFileName')) $imp('importFileName').textContent = '';
  renderImportPreview();
}

function importDragOver(e)  { e.preventDefault(); e.currentTarget.classList.add('dragover'); }
function importDragLeave(e) { e.currentTarget.classList.remove('dragover'); }
function importDrop(e) {
  e.preventDefault(); e.currentTarget.classList.remove('dragover');
  const f = e.dataTransfer?.files?.[0]; if (f) handleImportFile(f);
}
function importFileChosen(input) { const f = input.files?.[0]; if (f) handleImportFile(f); }

function handleImportFile(file) {
  if (importBusy) return;
  $imp('importFileName').textContent = file.name;
  if (!/\.(csv|txt)$/i.test(file.name)) { importState = { trades: [], errors: [], warnings: [], fatal: 'Please choose a .csv file.' }; renderImportPreview(); return; }
  if (file.size > IMPORT_MAX_BYTES) { importState = { trades: [], errors: [], warnings: [], fatal: 'File is larger than 5 MB.' }; renderImportPreview(); return; }
  const reader = new FileReader();
  reader.onload  = () => loadImportText(String(reader.result || ''));
  reader.onerror = () => { importState = { trades: [], errors: [], warnings: [], fatal: 'Could not read the file.' }; renderImportPreview(); };
  reader.readAsText(file);
}

function loadImportText(text) {
  importState = parseCSV(text);
  if (!importState.fatal && importState.trades.length) {      // warn about re-importing the same file
    const key = t => [t.date, t.sym, t.dir, +(t.entry_price ?? t.entry), +(t.exit_price ?? t.exit), +t.size].join('|');
    const have = new Set(getActiveTrades().map(key));
    const dups = importState.trades.filter(t => have.has(key(t))).length;
    if (dups) importState.warnings.push(`${dups} trade${dups > 1 ? 's look' : ' looks'} identical to trades already in this portfolio — importing will create duplicates.`);
  }
  renderImportPreview();
}

function renderImportPreview() {
  const sum = $imp('importSummary'), wrap = $imp('importPreviewWrap'), body = $imp('importPreviewBody'), btn = $imp('importConfirmBtn');
  if (!sum || !btn) return;
  const s = importState, n = s ? s.trades.length : 0;
  btn.disabled = !n || importBusy;
  btn.textContent = `IMPORT ${n} TRADE${n === 1 ? '' : 'S'} ▸`;

  if (!s) { sum.innerHTML = ''; wrap.style.display = 'none'; body.innerHTML = ''; return; }
  if (s.fatal) { sum.innerHTML = `<div class="import-msg err">✕ ${escHtml(s.fatal)}</div>`; wrap.style.display = 'none'; body.innerHTML = ''; return; }

  let html = n
    ? `<div class="import-msg ok">✓ ${n} valid trade${n === 1 ? '' : 's'} detected${s.errors.length ? ` · ${s.errors.length} row${s.errors.length === 1 ? '' : 's'} skipped` : ''}</div>`
    : `<div class="import-msg err">✕ No valid trades found</div>`;
  s.warnings.forEach(w => { html += `<div class="import-msg warn">⚠ ${escHtml(w)}</div>`; });
  s.errors.slice(0, 5).forEach(e => { html += `<div class="import-msg dim">line ${e.line}: ${escHtml(e.reason)}</div>`; });
  if (s.errors.length > 5) html += `<div class="import-msg dim">…and ${s.errors.length - 5} more skipped</div>`;
  sum.innerHTML = html;

  wrap.style.display = n ? '' : 'none';
  body.innerHTML = s.trades.slice(0, 5).map(t => {
    const r = t.actual_r;
    return `<tr><td>${escHtml(t.date)}</td><td>${escHtml(t.sym)}</td>` +
      `<td><span class="dir-tag ${t.dir === 'Long' ? 'long' : 'short'}">${t.dir === 'Long' ? '▲' : '▼'} ${escHtml(t.dir.toUpperCase())}</span></td>` +
      `<td>${t.entry_price}</td><td>${t.exit_price}</td><td>${t.size}</td>` +
      `<td>${t.stop_loss ?? '—'}</td><td>${r == null ? '—' : fmtR(r)}</td></tr>`;
  }).join('') + (n > 5 ? `<tr><td colspan="8" style="color:var(--muted)">…and ${n - 5} more</td></tr>` : '');
}

async function confirmImport() {
  if (importBusy || !importState || !importState.trades.length) return;
  await executeImport(importState.trades);
}

/**
 * Insert parsed trades into the active portfolio in chunks of 50.
 * On success: closes the modal and toasts. On a failed chunk: earlier chunks stay saved, the
 * modal stays open listing only the unsaved rows, so retrying cannot create duplicates.
 * Returns the number of trades saved.
 */
async function executeImport(parsedTrades) {
  const portfolio = getActivePortfolio();
  if (!portfolio || !currentUser) { toast('ไม่มีพอร์ต — สร้างพอร์ตก่อน', 'error'); return 0; }
  if (importBusy || !parsedTrades.length) return 0;

  importBusy = true;
  const btn = $imp('importConfirmBtn'), total = parsedTrades.length;
  if (btn) btn.disabled = true;

  const rows = parsedTrades.map(t => ({
    portfolio_id: portfolio.id, user_id: currentUser.id,
    ...t, account: portfolio.balance || 0,
  }));
  const saved = [];
  try {
    for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
      if (btn) btn.textContent = `IMPORTING ${saved.length}/${total}…`;
      const data = await dbInsertTrades(rows.slice(i, i + IMPORT_CHUNK));
      if (!data) break;
      saved.push(...data);
    }
  } finally {
    importBusy = false;
  }

  if (saved.length) { portfolio.trades.push(...saved); render(); }

  if (saved.length === total) {
    closeImportModalDirect();
    toast(`Imported ${total} trade${total === 1 ? '' : 's'} successfully ✓`);
  } else {
    if (importState) {
      importState.trades = parsedTrades.slice(saved.length);
      importState.errors = []; importState.warnings = [];
    }
    renderImportPreview();
    toast(saved.length
      ? `Import stopped: ${saved.length} of ${total} saved. Press import again to add the remaining ${total - saved.length}.`
      : 'Import failed — nothing was saved', 'error');
  }
  return saved.length;
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
