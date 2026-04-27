// ─── AUTH ─────────────────────────────────────────────────────────────────────
async function initAuth() {
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
  document.getElementById('authScreen').style.display  = 'flex';
  document.getElementById('appWrapper').style.display  = 'none';
}

async function showApp() {
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
  if (!email || !pass)       { authError('กรุณาใส่ email และ password'); return; }
  if (!email.includes('@'))  { authError('Email ไม่ถูกต้อง'); return; }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) { authError('รูปแบบ email ไม่ถูกต้อง'); return; }
  if (pass.length < 6)       { authError('Password ต้องมีอย่างน้อย 6 ตัวอักษร'); return; }
  if (!canSendEmail())       return;

  setAuthLoading(true);
  const { error } = await sb.auth.signUp({ email, password: pass });
  setAuthLoading(false);
  if (error) { authError(error.message); return; }
  authSuccess('สมัครสมาชิกสำเร็จ! ✓ กรุณาเช็ค email เพื่อยืนยัน');
}

async function login() {
  const email = document.getElementById('a-email').value.trim();
  const pass  = document.getElementById('a-pass').value;
  if (!email || !pass) { authError('กรุณาใส่ email และ password'); return; }
  setAuthLoading(true);
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  setAuthLoading(false);
  if (error) { authError('Email หรือ Password ไม่ถูกต้อง'); return; }
}

async function logout() {
  await sb.auth.signOut();
  portfolios = []; activePortfolioId = null;
}

async function forgotPassword() {
  if (!canSendEmail()) return;
  const email = document.getElementById('a-email').value.trim();
  if (!email) { authError('ใส่ email ก่อนแล้วกด Forgot Password'); return; }
  setAuthLoading(true);
  const { error } = await sb.auth.resetPasswordForEmail(email);
  setAuthLoading(false);
  if (error) { authError(error.message); return; }
  authSuccess('ส่ง reset link ไปที่ email แล้ว ✓');
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
  const isRegister = document.getElementById('authTitle').textContent === 'REGISTER';
  document.getElementById('btn-login').disabled    = on;
  document.getElementById('btn-register').disabled = on;
  const forgotBtn = document.querySelector('.btn-ghost');
  if (forgotBtn) forgotBtn.disabled = on;
  if (isRegister) {
    document.getElementById('btn-register').textContent = on ? 'LOADING...' : 'CREATE ACCOUNT ▸';
  } else {
    document.getElementById('btn-login').textContent = on ? 'LOADING...' : 'LOGIN ▸';
  }
}
function toggleAuthMode() {
  const title   = document.getElementById('authTitle');
  const isLogin = title.textContent === 'LOGIN';
  title.textContent = isLogin ? 'REGISTER' : 'LOGIN';
  document.getElementById('btn-login').style.display    = isLogin ? 'none'  : 'block';
  document.getElementById('btn-register').style.display = isLogin ? 'block' : 'none';
  document.getElementById('authToggleMsg').textContent  = isLogin ? 'มีบัญชีแล้ว?' : 'ยังไม่มีบัญชี?';
  document.getElementById('authToggleLink').textContent = isLogin ? 'Login' : 'Register';
  document.getElementById('authMsg').style.display = 'none';
}

// ─── EMAIL COOLDOWN ───────────────────────────────────────────────────────────
function canSendEmail() {
  const now = Date.now();
  if (now - lastEmailSent < EMAIL_COOLDOWN) {
    const remain = Math.ceil((EMAIL_COOLDOWN - (now - lastEmailSent)) / 1000);
    toast(`รออีก ${remain} วินาที`, 'error');
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
        const isRegister = document.getElementById('authTitle').textContent === 'REGISTER';
        isRegister ? register() : login();
      }
    });
  });
});
