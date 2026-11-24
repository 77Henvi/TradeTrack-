// ─── PORTFOLIO FUNCTIONS ──────────────────────────────────────────────────────
async function createPortfolio(name, balance) {
  const p = await dbCreatePortfolio(name, balance); if (!p) return null;
  portfolios.push(p); activePortfolioId = p.id; saveActivePortfolio(); return p;
}
function switchPortfolio(id) {
  activePortfolioId = id; saveActivePortfolio(); currentPage = 1; renderPortfolioTabs(); render();
}
function renderPortfolioTabs() {
  const container = document.getElementById('portfolioTabs');
  const activePort = getActivePortfolio();

  // Sync with Bento Virtual Trading Card
  if (activePort) {
    const nameEl = document.getElementById('cardAccountName');
    if (nameEl) nameEl.textContent = activePort.name;

    const trades = getActiveTrades();
    const totalPnl = trades.reduce((s, t) => s + pnl(t), 0);
    const curBal = (activePort.balance || 0) + totalPnl;
    const retPct = activePort.balance ? (totalPnl / activePort.balance * 100) : 0;

    const balEl = document.getElementById('cardBalanceDisplay');
    if (balEl) balEl.textContent = `$${fmtAbs(curBal, 2)}`;

    const retEl = document.getElementById('cardReturnPill');
    if (retEl) {
      retEl.textContent = `${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%`;
      retEl.style.color = retPct >= 0 ? 'var(--green)' : 'var(--red)';
    }
  }

  if (!container) return;
  container.innerHTML = portfolios.map(p =>
    `<button class="portfolio-tab ${p.id === activePortfolioId ? 'active' : ''}" onclick="switchPortfolio('${p.id}')">${escHtml(p.name)}</button>`
  ).join('') + `<button class="portfolio-tab-add" onclick="openNewPortfolioModal()" title="New portfolio" aria-label="Add new portfolio">+</button>`;
}

// ─── PORTFOLIO SETTINGS MODAL ─────────────────────────────────────────────────
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
  if (!await confirmDialog(`ลบพอร์ต "${escHtml(p.name)}" และ trade ทั้งหมด?`)) return;
  const ok = await dbDeletePortfolio(p.id); if (!ok) return;
  portfolios = portfolios.filter(x => x.id !== p.id);
  activePortfolioId = portfolios[0].id; saveActivePortfolio(); currentPage = 1;
  document.getElementById('portfolioSettingsOverlay').classList.remove('open');
  renderPortfolioTabs(); render(); toast('Portfolio deleted', 'error');
}

// ─── NEW PORTFOLIO MODAL ──────────────────────────────────────────────────────
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

// ─── WELCOME MODAL (first time) ───────────────────────────────────────────────
async function saveWelcome() {
  const name    = document.getElementById('w-name').value.trim();
  const balance = parseFloat(document.getElementById('w-balance').value);
  if (!name)                          { toast('ใส่ชื่อพอร์ตก่อนนะ', 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast('ใส่ Balance ให้ถูกต้อง', 'error'); return; }
  const p = await createPortfolio(name, balance); if (!p) return;
  document.getElementById('welcomeOverlay').classList.remove('open');
  renderPortfolioTabs(); render();
}
