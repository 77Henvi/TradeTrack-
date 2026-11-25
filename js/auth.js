// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function initAuth() {
  const isIntroReq = new URLSearchParams(location.search).get('intro') === '1';
  if (isIntroReq && window.ScrollyIntro) {
    window.ScrollyIntro.prepare();
  }

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showApp();
  } else {
    showAuthScreen();
  }
  sb.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) showApp();
    else showAuthScreen();
  });
}

function showAuthScreen() {
  const isIntroReq = new URLSearchParams(location.search).get('intro') === '1';
  if (!isIntroReq && window.ScrollyIntro) window.ScrollyIntro.teardown();   // logged out mid-intro (no-op if it isn't running)
  document.getElementById('authScreen').style.display  = 'flex';
  document.getElementById('appWrapper').style.display  = 'none';
  applyTurnstileMode();
}

// ─── TURNSTILE (Cloudflare CAPTCHA) — switched by ENABLE_TURNSTILE in config.js ─
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Off: hide the widget and never load Cloudflare's script. On: show it and load the script (once).
function applyTurnstileMode() {
  [document.querySelector('.cf-turnstile'), document.getElementById('turnstileWrap')].forEach(el => {
    if (el) el.style.display = ENABLE_TURNSTILE ? '' : 'none';
  });
  if (ENABLE_TURNSTILE && !window.turnstile && !document.getElementById('turnstile-api')) {
    const s = document.createElement('script');
    s.id = 'turnstile-api'; s.src = TURNSTILE_SRC; s.async = true; s.defer = true;
    document.head.appendChild(s);
  }
}
function getTurnstileToken() {
  return document.querySelector('[name="cf-turnstile-response"]')?.value || '';
}
// Off → returns at once, the widget is never read. On → needs a solved challenge; the token is
// handed to Supabase as captchaToken (Auth → Attack Protection must be configured to match).
function checkTurnstile() {
  if (ENABLE_TURNSTILE !== true) return { ok: true, token: null };
  const token = getTurnstileToken();
  if (!token) { authError(t('auth.errCaptcha')); return { ok: false, token: null }; }
  return { ok: true, token };
}
// tokens are single-use: reset the widget after every attempt so the user can retry
function resetTurnstile() {
  if (ENABLE_TURNSTILE !== true) return;
  try { window.turnstile?.reset(); } catch (_) { /* widget not ready */ }
}

async function showApp() {
  // 3D intro (first visit only). Idempotent: showApp() also runs on every auth event.
  if (window.ScrollyIntro) window.ScrollyIntro.prepare();
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appWrapper').style.display  = 'block';
  document.getElementById('userEmail').textContent = currentUser.email;
  showLoading(true);
  await loadAllData();
  showLoading(false);
  initAppListeners();
  renderPortfolioTabs();
  render();
  startTickerRefresh();
}

async function register() {
  // Validate before calling API
  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  if (!email || !pass)       { authError(t('auth.errRequired')); return; }
  if (!email.includes('@'))  { authError(t('auth.errInvalidEmail')); return; }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) { authError(t('auth.errEmailFormat')); return; }
  if (pass.length < 6)       { authError(t('auth.errPassLen')); return; }
  const ts = checkTurnstile(); if (!ts.ok) return;   // before the cooldown, so a missing CAPTCHA doesn't burn it
  if (!canSendEmail())       return;

  setAuthLoading(true);
  const { error } = await sb.auth.signUp({ email, password: pass, ...(ts.token && { options: { captchaToken: ts.token } }) });
  setAuthLoading(false); resetTurnstile();
  if (error) { authError(error.message); return; }
  authSuccess(t('auth.okSignup'));
}

async function login() {
  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  if (!email || !pass) { authError(t('auth.errRequired')); return; }
  const ts = checkTurnstile(); if (!ts.ok) return;
  setAuthLoading(true);
  const { error } = await sb.auth.signInWithPassword({ email, password: pass, ...(ts.token && { options: { captchaToken: ts.token } }) });
  setAuthLoading(false); resetTurnstile();
  if (error) { authError(t('auth.errLogin')); return; }
}

async function logout() {
  await sb.auth.signOut();
  portfolios = []; activePortfolioId = null;
}

async function forgotPassword() {
  const email = document.getElementById('a-email').value.trim();
  if (!email) { authError(t('auth.errForgotEmail')); return; }
  const ts = checkTurnstile(); if (!ts.ok) return;
  if (!canSendEmail()) return;
  setAuthLoading(true);
  const { error } = await sb.auth.resetPasswordForEmail(email, ts.token ? { captchaToken: ts.token } : undefined);
  setAuthLoading(false); resetTurnstile();
  if (error) { authError(error.message); return; }
  authSuccess(t('auth.okReset'));
}

// ─── AUTH UI HELPERS ──────────────────────────────────────────────────────────
function authError(msg) {
  const el = document.getElementById('authMsg');
  el.textContent = msg; el.className = 'auth-msg error'; el.style.display = 'block';
}
function authSuccess(msg) {
  const el = document.getElementById('authMsg');
  el.textContent = msg; el.className = 'auth-msg success'; el.style.display = 'block';
}
function setAuthLoading(on) {
  const isRegister = document.getElementById('authTitle')?.dataset.mode === 'register';
  document.getElementById('btn-login').disabled    = on;
  document.getElementById('btn-register').disabled = on;
  const forgotBtn = document.getElementById('btn-forgot');
  if (forgotBtn) forgotBtn.disabled = on;
  if (isRegister) {
    document.getElementById('btn-register').textContent = on ? t('auth.loadingBtn') : t('auth.registerBtn');
  } else {
    document.getElementById('btn-login').textContent = on ? t('auth.loadingBtn') : t('auth.loginBtn');
  }
}
function toggleAuthMode() {
  const title   = document.getElementById('authTitle');
  const isLogin = title.dataset.mode !== 'register';
  title.dataset.mode = isLogin ? 'register' : 'login';
  title.textContent  = t(isLogin ? 'auth.registerTitle' : 'auth.loginTitle');
  document.getElementById('btn-login').style.display    = isLogin ? 'none'  : 'block';
  document.getElementById('btn-register').style.display = isLogin ? 'block' : 'none';
  document.getElementById('authToggleMsg').textContent  = t(isLogin ? 'auth.hasAccount' : 'auth.noAccount');
  document.getElementById('authToggleLink').textContent = t(isLogin ? 'auth.loginLink' : 'auth.registerLink');
  document.getElementById('authMsg').style.display = 'none';
}

// ─── EMAIL COOLDOWN ───────────────────────────────────────────────────────────
function canSendEmail() {
  const now = Date.now();
  if (now - lastEmailSent < EMAIL_COOLDOWN) {
    const remain = Math.ceil((EMAIL_COOLDOWN - (now - lastEmailSent)) / 1000);
    authError(t('auth.waitCooldown', { s: remain }));
    return false;
  }
  lastEmailSent = now;
  return true;
}

// ─── AUTH KEYBOARD LISTENER ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  ['a-email', 'a-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const isRegister = document.getElementById('authTitle')?.dataset.mode === 'register';
        isRegister ? register() : login();
      }
    });
  });
});