// ─── LIVE TIME ────────────────────────────────────────────────────────────────
function updateTime() {
  const el = document.getElementById('liveTime');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(updateTime, 1000); updateTime();

// ─── TICKER ───────────────────────────────────────────────────────────────────
let tickerPrefs = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('ticker_prefs'))) || { speed: 30, color: '#f59e0b' };

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

const FINNHUB_KEY = 'd83j3spr01qkm5c8b8fgd83j3spr01qkm5c8b8g0';
let cachedNews = [];

async function fetchEconomicCalendar() {
  const today = new Date();
  const from  = today.toISOString().slice(0, 10);
  const to    = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  try {
    const res  = await fetch(`https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_KEY}`);
    const data = await res.json();
    cachedNews = (data.economicCalendar || [])
      .filter(e => e.impact === 'high' || e.impact === 'medium')
      .slice(0, 8)
      .map(e => ({
        flag:   countryToFlag(e.country),
        event:  e.event,
        time:   formatEventTime(e.time),
        impact: e.impact === 'high' ? 'HIGH' : 'MED'
      }));
  } catch(err) {
    console.warn('Finnhub fetch failed:', err);
  }
}

function countryToFlag(country) {
  const map = {
    'US': '🇺🇸', 'EU': '🇪🇺', 'GB': '🇬🇧', 'JP': '🇯🇵',
    'CA': '🇨🇦', 'AU': '🇦🇺', 'CH': '🇨🇭', 'CN': '🇨🇳',
    'NZ': '🇳🇿', 'DE': '🇩🇪', 'FR': '🇫🇷'
  };
  return map[country?.toUpperCase()] || '🌐';
}

function formatEventTime(isoTime) {
  if (!isoTime) return '—';
  const d = new Date(isoTime);
  return d.toLocaleString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function buildForexTicker() {
  const ticker = document.getElementById('ticker'); if (!ticker) return;
  const sessions = getMarketSessions();
  const sessionHtml = sessions.map(s =>
    `<span class="ticker-item"><span class="sym">${s.name}</span><span class="chg" style="${s.status === 'CLOSED' ? 'color:var(--muted)' : 'color:var(--green)'}">${s.status === 'OPEN' ? '🟢 OPEN' : '🔴 CLOSED'}</span></span><span class="ticker-sep">|</span>`
  ).join('');
  const newsHtml = cachedNews.map(n =>
  `<span class="ticker-item"><span class="sym">${n.flag} ${n.event}</span><span style="color:var(--text);opacity:0.8">${n.time}</span><span class="chg ${n.impact === 'HIGH' ? 'neg' : 'orange'}">${n.impact === 'HIGH' ? '🔥' : '⚠️'}</span></span><span class="ticker-sep">|</span>`
  ).join('');
  const fullHtml = sessionHtml + `<span class="ticker-item" style="color:var(--ticker-hl);font-family:var(--mono);letter-spacing:2px;font-size:10px;">UPCOMING NEWS ⚡</span><span class="ticker-sep">|</span>` + newsHtml;
  ticker.innerHTML = fullHtml + fullHtml;
}

async function startTickerRefresh() {
  await fetchEconomicCalendar();
  buildForexTicker();
  setInterval(async () => {
    await fetchEconomicCalendar();
    buildForexTicker();
  }, 60 * 60 * 1000); // refresh ทุก 1 ชั่วโมง
}

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