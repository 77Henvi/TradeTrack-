// ─── LIVE TIME ────────────────────────────────────────────────────────────────
function updateTime() {
  const el = document.getElementById('liveTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateTime, 1000); updateTime();

// ─── TICKER ───────────────────────────────────────────────────────────────────
let tickerPrefs = JSON.parse(localStorage.getItem('ticker_prefs')) || { speed: 30, color: '#f59e0b' };

function applyTickerStyles() {
  document.documentElement.style.setProperty('--ticker-speed', tickerPrefs.speed + 's');
  document.documentElement.style.setProperty('--ticker-hl', tickerPrefs.color);
}
applyTickerStyles();

function getMarketSessions() {
  const utcHour = new Date().getUTCHours();
  const sessions = [
    { name: '🇦🇺 SYDNEY',   open: 22, close: 7  },
    { name: '🇯🇵 TOKYO',    open: 0,  close: 9  },
    { name: '🇬🇧 LONDON',   open: 8,  close: 16 },
    { name: '🇺🇸 NEW YORK', open: 13, close: 22 }
  ];
  return sessions.map(s => {
    const isOpen = s.open < s.close
      ? (utcHour >= s.open && utcHour < s.close)
      : (utcHour >= s.open || utcHour < s.close);
    return { name: s.name, status: isOpen ? 'OPEN' : 'CLOSED' };
  });
}

function getUpcomingNews() {
  return [
    { flag: '🇺🇸', event: 'CPI m/m',          time: 'Wed 19:30', impact: 'HIGH' },
    { flag: '🇪🇺', event: 'ECB Press Conf',    time: 'Thu 19:45', impact: 'HIGH' },
    { flag: '🇺🇸', event: 'Non-Farm Payrolls', time: 'Fri 19:30', impact: 'HIGH' },
    { flag: '🇬🇧', event: 'BOE Gov Speaks',    time: 'Fri 21:00', impact: 'MED'  },
  ];
}

function buildForexTicker() {
  const ticker = document.getElementById('ticker'); if (!ticker) return;
  const sessions = getMarketSessions(), news = getUpcomingNews();
  const sessionHtml = sessions.map(s =>
    `<span class="ticker-item"><span class="sym">${s.name}</span><span class="chg" style="${s.status === 'CLOSED' ? 'color:var(--muted)' : 'color:var(--green)'}">${s.status === 'OPEN' ? '🟢 OPEN' : '🔴 CLOSED'}</span></span><span class="ticker-sep">|</span>`
  ).join('');
  const newsHtml = news.map(n =>
    `<span class="ticker-item"><span class="sym">${n.flag} ${n.event}</span><span style="color:var(--text);opacity:0.8">${n.time}</span><span class="chg ${n.impact === 'HIGH' ? 'neg' : 'orange'}">${n.impact === 'HIGH' ? '🔥' : '⚠️'}</span></span><span class="ticker-sep">|</span>`
  ).join('');
  const fullHtml = sessionHtml + `<span class="ticker-item" style="color:var(--ticker-hl);font-family:var(--mono);letter-spacing:2px;font-size:10px;">UPCOMING NEWS ⚡</span><span class="ticker-sep">|</span>` + newsHtml;
  ticker.innerHTML = fullHtml + fullHtml;
}

function startTickerRefresh() { buildForexTicker(); setInterval(buildForexTicker, 60000); }

// ─── TICKER SETTINGS MODAL ────────────────────────────────────────────────────
function openTickerSettings() {
  const overlay = document.getElementById('tickerSettingsOverlay'); if (!overlay) return;
  overlay.classList.add('open');
  const speedEl   = document.getElementById('ts-speed');
  const speedVal  = document.getElementById('speed-val');
  const colorInput = document.getElementById('ts-color');
  if (speedEl)    { speedEl.value = tickerPrefs.speed; if (speedVal) speedVal.innerText = tickerPrefs.speed + 's'; }
  if (colorInput) colorInput.value = tickerPrefs.color;
  document.querySelectorAll('.ticker-color-btn').forEach(b =>
    b.classList.toggle('active-color', b.dataset.color === tickerPrefs.color)
  );
  if (speedEl && speedVal) speedEl.oninput = () => { speedVal.innerText = speedEl.value + 's'; };
}
function selectTickerColor(el, color) {
  document.getElementById('ts-color').value = color;
  document.querySelectorAll('.ticker-color-btn').forEach(b => b.classList.remove('active-color'));
  el.classList.add('active-color');
}
function applyTickerSettings() {
  const speedEl    = document.getElementById('ts-speed');
  const colorInput = document.getElementById('ts-color');
  if (speedEl)    tickerPrefs.speed = parseInt(speedEl.value) || 30;
  if (colorInput && colorInput.value) tickerPrefs.color = colorInput.value;
  localStorage.setItem('ticker_prefs', JSON.stringify(tickerPrefs));
  applyTickerStyles(); buildForexTicker();
  document.getElementById('tickerSettingsOverlay').classList.remove('open');
  toast('Ticker settings applied ✓');
}
function closeTickerSettings(e) {
  if (!e || e.target === document.getElementById('tickerSettingsOverlay'))
    document.getElementById('tickerSettingsOverlay')?.classList.remove('open');
}
