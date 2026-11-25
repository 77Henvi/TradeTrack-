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

  syncBalanceDisplays();   // hero + account card, same source as render()

  if (!container) return;
  container.innerHTML = portfolios.map(p =>
    `<button class="portfolio-tab ${p.id === activePortfolioId ? 'active' : ''}" onclick="switchPortfolio('${p.id}')">${escHtml(p.name)}</button>`
  ).join('') + `<button class="portfolio-tab-add" onclick="openNewPortfolioModal()" title="${escHtml(t('acc.newBtnTitle'))}" aria-label="${escHtml(t('acc.newBtnTitle'))}">+</button>`;
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
  if (!name)                          { toast(t('prt.errName'), 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast(t('prt.errBal'), 'error'); return; }
  const ok = await dbUpdatePortfolio(p.id, name, balance); if (!ok) return;
  p.name = name; p.balance = balance;
  document.getElementById('portfolioSettingsOverlay').classList.remove('open');
  renderPortfolioTabs(); render(); toast(t('prt.updated'));
}
async function deletePortfolio() {
  const p = getActivePortfolio(); if (!p) return;
  if (portfolios.length <= 1) { toast(t('prt.minOne'), 'error'); return; }
  if (!await confirmDialog(t('prt.confirmDel', { name: p.name }))) return;
  const ok = await dbDeletePortfolio(p.id); if (!ok) return;
  portfolios = portfolios.filter(x => x.id !== p.id);
  activePortfolioId = portfolios[0].id; saveActivePortfolio(); currentPage = 1;
  document.getElementById('portfolioSettingsOverlay').classList.remove('open');
  renderPortfolioTabs(); render(); toast(t('prt.deleted'), 'error');
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
  if (!name)                          { toast(t('prt.errName'), 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast(t('prt.errBal'), 'error'); return; }
  const p = await createPortfolio(name, balance); if (!p) return;
  document.getElementById('newPortfolioOverlay').classList.remove('open');
  renderPortfolioTabs(); render(); toast(t('prt.created'));
}

// ─── WELCOME MODAL (first time) ───────────────────────────────────────────────
async function saveWelcome() {
  const name    = document.getElementById('w-name').value.trim();
  const balance = parseFloat(document.getElementById('w-balance').value);
  if (!name)                          { toast(t('prt.errName'), 'error'); return; }
  if (isNaN(balance) || balance <= 0) { toast(t('prt.errBal'), 'error'); return; }
  const p = await createPortfolio(name, balance); if (!p) return;
  document.getElementById('welcomeOverlay').classList.remove('open');
  renderPortfolioTabs(); render();
}

// ─── EXTENDED MULTI-PORTFOLIO GRID ───────────────────────────────────────────
function renderExtendedPortfolios() {
  const container = document.getElementById('extendedPortfolioGrid');
  if (!container) return;
  container.innerHTML = portfolios.map(p => {
    const pTrades = p.trades || [];
    const { pnl: pnlSum, bal: curBal, ret: retPct } = portfolioStats(p);
    const wins = pTrades.filter(t => pnl(t) > 0).length;
    const wr = pTrades.length ? (wins / pTrades.length * 100).toFixed(1) : '0.0';
    const isActive = p.id === activePortfolioId;

    return `
      <div class="virtual-trading-card portfolio-grid-card ${isActive ? 'is-active-card' : ''}">
        <div class="card-chip-row">
          <span class="card-logo-badge">▲ TRACKTRADE</span>
          <span class="card-prop-tag ${isActive ? 'active-tag' : ''}">${isActive ? t('acc.curActive') : t('acc.subAccount')}</span>
        </div>
        <div class="card-balance-block">
          <div class="card-balance-label">${t('acc.balanceLabel')}</div>
          <div class="card-balance-val">$${fmtAbs(curBal, 2)}</div>
        </div>
        <div class="card-stats-grid">
          <div class="cs-item"><span class="cs-label">${t('acc.netPnl')}</span> <span class="cs-val ${pnlSum >= 0 ? 'pos' : 'neg'}">${pnlSum >= 0 ? '+' : ''}$${fmtAbs(pnlSum)}</span></div>
          <div class="cs-item"><span class="cs-label">${t('acc.returnLbl')}</span> <span class="cs-val ${retPct >= 0 ? 'pos' : 'neg'}">${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%</span></div>
          <div class="cs-item"><span class="cs-label">${t('acc.winRateLbl')}</span> <span class="cs-val">${wr}% ${t('acc.tradesCount', { n: pTrades.length })}</span></div>
        </div>
        <div class="card-footer-row" style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
          <div class="card-account-name" style="font-size:14px;font-weight:800">${escHtml(p.name)}</div>
          ${!isActive
            ? `<button class="btn-ghost btn-sm-pill" onclick="switchPortfolio('${p.id}'); renderExtendedPortfolios();">${t('acc.switchBtn')}</button>`
            : `<span class="active-badge-pill">${t('acc.activeBadge')}</span>`}
        </div>
      </div>
    `;
  }).join('');
}
