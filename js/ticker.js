// ─── LIVE TIME ────────────────────────────────────────────────────────────────
const _timeFmt = new Intl.DateTimeFormat('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
function updateTime() {
  if (document.hidden) return;
  const el = document.getElementById('liveTime');
  if (el) el.textContent = _timeFmt.format(new Date());
}
setInterval(updateTime, 1000); updateTime();

// ─── TICKER ───────────────────────────────────────────────────────────────────
let tickerPrefs = (typeof localStorage !== 'undefined' && JSON.parse(localStorage.getItem('ticker_prefs'))) || { speed: 30, color: '#f59e0b' };

function applyTickerStyles() {
  document.documentElement.style.setProperty('--ticker-speed', tickerPrefs.speed + 's');
  document.documentElement.style.setProperty('--ticker-hl', tickerPrefs.color);
}
applyTickerStyles();

// ─── MARKET SESSIONS — เวลาไทย (GMT+7, ไม่มี DST) ───────────────────────────────
const TH_OFFSET_MIN = 7 * 60;
const MARKET_SESSIONS = [
  { name: '🇬🇧 LONDON SESSION', start: '14:00', end: '17:00' },
  { name: '🇺🇸 NY AM SESSION',  start: '20:30', end: '23:00' },
  { name: '🇺🇸 NY LUNCH HOUR',  start: '23:00', end: '01:00' },
  { name: '🇺🇸 NY PM SESSION',  start: '01:00', end: '04:00' },
  { name: '🌏 ASIA SESSION',    start: '08:00', end: '12:00' },
];
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
function thaiMinutesNow() {
  const d = new Date();
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + TH_OFFSET_MIN) % 1440;
}
function getMarketSessions() {
  const now = thaiMinutesNow();
  return MARKET_SESSIONS.map(s => {
    const a = toMin(s.start), b = toMin(s.end);
    const isOpen = a < b ? (now >= a && now < b) : (now >= a || now < b);   // handles 23:00–01:00
    return { name: s.name, range: `${s.start}–${s.end}`, status: isOpen ? 'OPEN' : 'CLOSED' };
  });
}

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
  const sessionHtml = sessions.map(s => {
    const open = s.status === 'OPEN';
    return `<span class="ticker-item"><span class="sym">${s.name}</span>` +
      `<span class="ticker-time" style="color:${open ? 'var(--green)' : 'var(--text)'};opacity:${open ? 1 : 0.85}">${s.range}</span>` +
      `<span class="chg ticker-status" style="color:${open ? 'var(--green)' : 'var(--muted)'}">${open ? '🟢 OPEN' : '🔴 CLOSED'}</span></span><span class="ticker-sep">|</span>`;
  }).join('');
  const newsHtml = cachedNews.map(n =>
  `<span class="ticker-item"><span class="sym">${n.flag} ${n.event}</span><span style="color:var(--text);opacity:0.8;font-size:13px">${n.time}</span><span class="chg ${n.impact === 'HIGH' ? 'neg' : 'orange'}">${n.impact === 'HIGH' ? '🔥' : '⚠️'}</span></span><span class="ticker-sep">|</span>`
  ).join('');
  const fullHtml = sessionHtml + `<span class="ticker-item" style="color:var(--ticker-hl);font-family:var(--mono);letter-spacing:2px;font-size:12px;">UPCOMING NEWS ⚡</span><span class="ticker-sep">|</span>` + newsHtml;
  const newHtml = fullHtml + fullHtml;

  // status chips in the settings modal
  const dot = document.getElementById('tickerModalStatus'), tm = document.getElementById('tickerModalTime');
  if (dot) dot.style.background = sessions.some(s => s.status === 'OPEN') ? 'var(--green)' : 'var(--muted)';
  if (tm) { const m = thaiMinutesNow(); tm.textContent = `${String(m / 60 | 0).padStart(2, '0')}:${String(m % 60).padStart(2, '0')} (GMT+7)`; }

  // Only touch the DOM when the content actually changed (session flips / news refresh)
  if (_tickerHtml === newHtml) return;
  _tickerHtml = newHtml;
  ticker.innerHTML = newHtml;
}
let _tickerHtml = '';

async function startTickerRefresh() {
  await fetchEconomicCalendar();
  buildForexTicker();
  // sessions flip on :00 / :30 — re-check every 30s (cheap: DOM is untouched unless something changed)
  setInterval(() => { if (!document.hidden) buildForexTicker(); }, 30 * 1000);
  setInterval(async () => { await fetchEconomicCalendar(); buildForexTicker(); }, 60 * 60 * 1000);
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
