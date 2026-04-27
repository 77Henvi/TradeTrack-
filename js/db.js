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

// ─── PORTFOLIO CRUD ───────────────────────────────────────────────────────────
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

// ─── TRADE CRUD ───────────────────────────────────────────────────────────────
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

// ─── ACTIVE PORTFOLIO PERSISTENCE ─────────────────────────────────────────────
function saveActivePortfolio() {
  if (currentUser) localStorage.setItem('active_portfolio_' + currentUser.id, activePortfolioId);
}
