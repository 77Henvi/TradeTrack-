/* ════════════════════════════════════════════════════════════════════════════
   TrackTrade — 16-Scene 3D Scrollytelling Intro  (engine v3)
   Scroll-scrubbed WebGL story: glass coin → crystal → risk HUD → R-multiples →
   burst → warp → shockwave → exploded audit → multi-account → blueprint → dashboard dock.

   What changed vs v2 (see README "3D intro" for the full list):
   • prepare() is truly idempotent (auth events used to start the intro twice)
   • glass built without `transmission` → MSAA edges, ~2x cheaper, works on mobile
   • thick neon triangle (tube geometry + layered glow) instead of 1px GL lines
   • warp streaks, burst sparks, grid terrain actually render
   • adaptive quality (DPR ladder) driven by real frame time
   • branded loader with real progress, CDN fallbacks, Lenis optional
   • chapter rail (click to jump), final CTA, curtain transition on skip,
     scroll position preserved when the intro hands over to the dashboard
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SEEN_KEY = 'tt_intro_seen_v2';
  const CDN = {
    three:  ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'],
    gsap:   ['https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js', 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js'],
    st:     ['https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js', 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js'],
    lenis:  ['https://unpkg.com/lenis@1.1.18/dist/lenis.min.js', 'https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js'],
  };

  // Brand palette (matches style.css tokens)
  const COL = {
    sunset: 0xff6129, vermillion: 0xfc3b00, peach: 0xff7145, cyan: 0x38bdf8,
    green: 0x22c55e, mint: 0x6ee7a0, gold: 0xffb347, titanium: 0x2a2522, silver: 0x8d8680,
    white: 0xffffff, ink: 0x050302,
  };

  const tr = (k, v) => (typeof window.t === 'function' ? window.t(k, v) : k);

  // Story chapters. `t` is the timeline position (0–100) where the chapter text lands.
  // One source of truth for the chapter rail, the live-region announcer and click-to-jump.
  const CHAPTERS = [
    { t: 11,   key: 'intro.ch1Name', fallback: 'Record'   },
    { t: 20.5, key: 'intro.ch2Name', fallback: 'Risk'     },
    { t: 33,   key: 'intro.ch3Name', fallback: 'Returns'  },
    { t: 59,   key: 'intro.ch4Name', fallback: 'Audit'    },
    { t: 72,   key: 'intro.ch5Name', fallback: 'Accounts' },
    { t: 85,   key: 'intro.ch6Name', fallback: 'Overview' },
  ];
  const chName = c => (typeof window.t === 'function' ? window.t(c.key) : c.fallback);

  const $ = id => document.getElementById(id);
  const S = { phase: 'idle', finishing: false, skipping: false, run: null };
  const qs = new URLSearchParams(location.search);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) {} };

  function shouldPlay() {
    const mm = q => window.matchMedia && window.matchMedia(q).matches;
    if (mm('(prefers-reduced-motion: reduce)')) return false;
    if (navigator.connection && navigator.connection.saveData) return false;
    if (qs.get('intro') === '1') return true;
    try { return localStorage.getItem(SEEN_KEY) !== '1'; } catch (_) { return true; }
  }

  // ─── LOADING (mirror fallback, real progress, Lenis optional) ──────────────
  function loadScript(src, timeout = 9000) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const t = setTimeout(() => { s.remove(); reject(new Error('timeout: ' + src)); }, timeout);
      s.src = src; s.async = true;
      s.onload  = () => { clearTimeout(t); resolve(); };
      s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('failed: ' + src)); };
      document.head.appendChild(s);
    });
  }
  async function loadFirst(urls) {
    let last;
    for (const u of urls) { try { await loadScript(u); return; } catch (e) { last = e; } }
    throw last;
  }
  async function loadLibs(tick) {
    const need = (g, urls) => (window[g] ? Promise.resolve() : loadFirst(urls)).then(tick);
    const fonts = Promise.race([
      document.fonts && document.fonts.load ? document.fonts.load('800 48px Inter').catch(() => {}) : Promise.resolve(),
      new Promise(r => setTimeout(r, 2500)),
    ]).then(tick);
    await Promise.all([
      need('THREE', CDN.three),
      need('gsap', CDN.gsap).then(() => need('ScrollTrigger', CDN.st)),
      need('Lenis', CDN.lenis).catch(() => { tick(); console.warn('Lenis unavailable – using native scroll'); }),
      fonts,
    ]);
  }

  // ─── PROCEDURAL CANVAS TEXTURES ────────────────────────────────────────────
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };
  const tex = (c, aniso = 4) => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = aniso; return t; };
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function glowSpriteTexture(inner, outer) {
    const c = mkCanvas(256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, inner); gr.addColorStop(0.38, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return tex(c, 1);
  }

  // 2× supersampled so the labels stay crisp when the camera pushes in
  function labelTexture(text, color, bg = 'rgba(13,10,8,0.78)', borderColor = '#FF6129') {
    const c = mkCanvas(640, 220), g = c.getContext('2d'); g.scale(2, 2);
    rr(g, 8, 8, 304, 94, 20); g.fillStyle = bg; g.fill();
    g.strokeStyle = borderColor; g.lineWidth = 3; g.stroke();
    g.font = '800 48px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 14; g.fillStyle = color; g.fillText(text, 160, 56);
    return tex(c);
  }

  function circularBadgeTexture(text, sub, color, borderColor = '#FF6129') {
    const c = mkCanvas(512), g = c.getContext('2d'); g.scale(2, 2);
    g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2);
    g.fillStyle = 'rgba(8,6,5,0.85)'; g.fill();
    g.strokeStyle = borderColor; g.lineWidth = 6; g.stroke();
    g.font = '800 50px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 12; g.fillStyle = color;
    g.fillText(text, 128, 105);
    g.font = '700 20px Inter, sans-serif'; g.fillStyle = '#a39791'; g.shadowBlur = 0;
    g.fillText(sub, 128, 155);
    return tex(c);
  }

  // Coin face: dark dial with a faint chart grid, price line and bezel ticks (reads as glass over a chart)
  function dialTexture() {
    const N = 1024, c = mkCanvas(N), g = c.getContext('2d');
    const gr = g.createRadialGradient(N / 2, N / 2, 20, N / 2, N / 2, N / 2);
    gr.addColorStop(0, '#2a1107'); gr.addColorStop(0.55, '#130805'); gr.addColorStop(1, '#060302');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    g.strokeStyle = 'rgba(255,97,41,0.07)'; g.lineWidth = 1;
    for (let i = 0; i <= N; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, N); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(N, i); g.stroke(); }
    const rng = mulberry32(7); g.strokeStyle = 'rgba(255,113,69,0.28)'; g.lineWidth = 3; g.beginPath();
    let y = N * 0.62; g.moveTo(80, y);
    for (let x = 80; x <= N - 80; x += 28) { y = clamp(y + (rng() - 0.55) * 46, N * 0.3, N * 0.72); g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = 'rgba(255,97,41,0.22)'; g.lineWidth = 2;
    [0.47, 0.42].forEach(r => { g.beginPath(); g.arc(N / 2, N / 2, N * r, 0, Math.PI * 2); g.stroke(); });
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2, r1 = N * 0.47, r2 = N * (i % 5 === 0 ? 0.445 : 0.458);
      g.beginPath(); g.moveTo(N / 2 + Math.cos(a) * r1, N / 2 + Math.sin(a) * r1); g.lineTo(N / 2 + Math.cos(a) * r2, N / 2 + Math.sin(a) * r2); g.stroke();
    }
    return tex(c, 8);
  }

  // Art-directed glass reflection: diagonal light bands + fresnel rim. Replaces a Standard-material gloss layer,
  // whose point-light specular washed the whole face into flat tan.
  function sheenTexture() {
    const N = 512, c = mkCanvas(N), g = c.getContext('2d');
    const band = (a, b, k) => {
      const gr = g.createLinearGradient(0, 0, N, N);
      gr.addColorStop(Math.max(0, a - 0.08), 'rgba(255,214,180,0)'); gr.addColorStop(a, `rgba(255,214,180,${k})`);
      gr.addColorStop(b, 'rgba(255,214,180,0)'); g.fillStyle = gr; g.fillRect(0, 0, N, N);
    };
    band(0.30, 0.42, 0.22); band(0.56, 0.62, 0.12);
    const rim = g.createRadialGradient(N / 2, N / 2, N * 0.34, N / 2, N / 2, N / 2);
    rim.addColorStop(0, 'rgba(255,110,50,0)'); rim.addColorStop(1, 'rgba(255,110,50,0.30)');
    g.fillStyle = rim; g.fillRect(0, 0, N, N);
    return tex(c, 4);
  }

  // Scene 14: blueprint / circuit floor
  function createBlueprintTexture() {
    const c = mkCanvas(1024, 1024), g = c.getContext('2d');
    g.fillStyle = '#05070d'; g.fillRect(0, 0, 1024, 1024);
    g.strokeStyle = 'rgba(56, 189, 248, 0.10)'; g.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1024); g.stroke(); }
    for (let y = 0; y <= 1024; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
    g.strokeStyle = 'rgba(255, 97, 41, 0.85)'; g.lineWidth = 3; g.shadowColor = '#FF6129'; g.shadowBlur = 10;
    const paths = [
      [[512, 512], [512, 384], [384, 384], [384, 256], [256, 256]],
      [[512, 512], [512, 640], [640, 640], [640, 768], [768, 768]],
      [[512, 512], [640, 512], [640, 384], [768, 384]],
      [[512, 512], [384, 512], [384, 640], [256, 640]],
      [[416, 416], [608, 416], [608, 608], [416, 608], [416, 416]],
      [[320, 320], [704, 320], [704, 704], [320, 704], [320, 320]],
      [[128, 512], [256, 512], [256, 448], [320, 448]],
      [[896, 512], [768, 512], [768, 576], [704, 576]],
    ];
    paths.forEach(p => {
      g.beginPath(); g.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]);
      g.stroke();
      p.forEach(pt => { g.beginPath(); g.arc(pt[0], pt[1], 5, 0, Math.PI * 2); g.fillStyle = '#FC3B00'; g.fill(); });
    });
    g.strokeStyle = '#38BDF8'; g.lineWidth = 2; g.shadowColor = '#38BDF8'; g.shadowBlur = 8;
    g.strokeRect(460, 460, 104, 104);
    return tex(c, 8);
  }

  // Scene 15: holographic dashboard tablet
  function createDashboardTexture() {
    const c = mkCanvas(1024, 640), g = c.getContext('2d');
    g.fillStyle = '#080605'; g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = 'rgba(255, 97, 41, 0.45)'; g.lineWidth = 3; g.strokeRect(6, 6, 1012, 628);
    g.fillStyle = 'rgba(255, 97, 41, 0.10)'; g.fillRect(6, 6, 1012, 64);
    g.fillStyle = '#FF6129'; g.font = 'bold 22px Inter, sans-serif';
    g.fillText('▲  TrackTrade', 36, 42);
    g.font = '600 14px Inter, sans-serif'; g.fillStyle = '#a39791';
    g.fillText('Multi-portfolio · live', 780, 42);
    const kpis = [
      { title: 'Net P&L', val: '+$48,150.00', col: '#22c55e' },
      { title: 'Win rate', val: '71.4%', col: '#FF6129' },
      { title: 'Profit factor', val: '2.41', col: '#38bdf8' },
      { title: 'Avg R:R', val: '1:2.85', col: '#ffb347' },
    ];
    kpis.forEach((k, i) => {
      const x = 36 + i * 240;
      rr(g, x, 90, 220, 80, 8); g.fillStyle = 'rgba(255,255,255,0.04)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.stroke();
      g.fillStyle = '#a39791'; g.font = '700 12px Inter, sans-serif'; g.fillText(k.title, x + 16, 115);
      g.fillStyle = k.col; g.font = 'bold 22px Inter, sans-serif'; g.fillText(k.val, x + 16, 148);
    });
    g.strokeStyle = 'rgba(255, 97, 41, 0.25)'; g.lineWidth = 1; g.strokeRect(36, 190, 952, 410);
    for (let i = 0; i < 28; i++) {
      const cx = 60 + i * 33, cy = 380 - Math.sin(i * 0.28) * 85 - (i * 3.2), ch = 14 + ((i * 17) % 42), isUp = i % 3 !== 0;
      g.strokeStyle = isUp ? '#FF6129' : '#FF7145'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy - ch - 12); g.lineTo(cx, cy + ch + 12); g.stroke();
      g.fillStyle = isUp ? '#FF6129' : '#FC3B00'; g.fillRect(cx - 7, cy - ch, 14, ch * 2);
    }
    g.strokeStyle = '#22c55e'; g.lineWidth = 4; g.shadowColor = '#22c55e'; g.shadowBlur = 12;
    g.beginPath(); g.moveTo(40, 520);
    for (let x = 40; x <= 980; x += 20) { const p = (x - 40) / 940; g.lineTo(x, 520 - p * 280 + Math.sin(p * 12) * 22); }
    g.stroke();
    return tex(c, 8);
  }

  // ─── GEOMETRY HELPERS ──────────────────────────────────────────────────────
  // Rounded equilateral triangle outline, centroid at origin
  function roundedTrianglePoints(s, rc, per = 9) {
    const h = (s * Math.sqrt(3)) / 2;
    const V = [new THREE.Vector3(0, (2 / 3) * h, 0), new THREE.Vector3(s / 2, -h / 3, 0), new THREE.Vector3(-s / 2, -h / 3, 0)];
    const t = rc / Math.tan(Math.PI / 6), pts = [];
    for (let i = 0; i < 3; i++) {
      const p0 = V[(i + 2) % 3], p1 = V[i], p2 = V[(i + 1) % 3];
      const a = p1.clone().add(p0.clone().sub(p1).normalize().multiplyScalar(t));
      const b = p1.clone().add(p2.clone().sub(p1).normalize().multiplyScalar(t));
      for (let k = 0; k <= per; k++) {
        const u = k / per, w = 1 - u;
        pts.push(new THREE.Vector3(w * w * a.x + 2 * w * u * p1.x + u * u * b.x, w * w * a.y + 2 * w * u * p1.y + u * u * b.y, 0));
      }
      const nb = V[(i + 1) % 3], na = p2.clone().add(p1.clone().sub(p2).normalize().multiplyScalar(t));
      for (let k = 1; k <= 3; k++) pts.push(b.clone().lerp(na, k / 4));
    }
    return pts;
  }

  // Glowing neon triangle: white-hot core + 2 additive halos (fake bloom, alpha-safe)
  function createNeonTriangle(s, hex, radius) {
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(roundedTrianglePoints(s, s * 0.07), true, 'centripetal');
    const mk = (r, color, opacity, additive) => {
      const m = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: !additive });
      if (additive) m.blending = THREE.AdditiveBlending;
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, r, 10, true), m);
      g.add(mesh); return m;
    };
    const core = mk(radius, hex, 1, false);
    const hot  = mk(radius * 0.38, 0xffe3cf, 1, false);
    const h1   = mk(radius * 2.6, hex, 0.26, true);
    const h2   = mk(radius * 5.4, hex, 0.09, true);
    return { group: g, mats: [core, h1, h2], hot };
  }

  // Candlestick cluster (Scene 01–03)
  function createCandlestickGroup() {
    const g = new THREE.Group();
    const pr = mulberry32(101), n = 14, span = 1.6, step = span / (n - 1);
    const bullMat = new THREE.MeshBasicMaterial({ color: COL.sunset, toneMapped: false });
    const bearMat = new THREE.MeshBasicMaterial({ color: COL.peach, toneMapped: false });
    const cyanMat = new THREE.MeshBasicMaterial({ color: COL.cyan, toneMapped: false });
    const wickMat = new THREE.LineBasicMaterial({ color: COL.vermillion, transparent: true, opacity: 0.85 });
    let curY = -0.35;
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + i * step;
      curY += (pr() - 0.38) * 0.16; curY = clamp(curY, -0.55, 0.45);
      const isBull = pr() > 0.35, h = 0.08 + pr() * 0.22;
      const wickTop = curY + h / 2 + 0.04 + pr() * 0.08, wickBot = curY - h / 2 - 0.04 - pr() * 0.08;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, h, 0.05), (i === n - 2) ? cyanMat : (isBull ? bullMat : bearMat));
      body.position.set(x, curY, (pr() - 0.5) * 0.05); g.add(body);
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, wickBot, 0), new THREE.Vector3(x, wickTop, 0)]), wickMat));
    }
    return g;
  }

  // Coin cross-section lathed around Z: crisp bevel instead of a flat extrude
  function coinGeometry(radius, thick, bevel) {
    const h = thick / 2, b = bevel;
    // bottom → top: LatheGeometry only yields outward-facing normals in this order
    const prof = [[0, -h], [radius - b, -h], [radius - b * 0.35, -h + b * 0.35], [radius, -h + b], [radius, h - b], [radius - b * 0.35, h - b * 0.35], [radius - b, h], [0, h]]
      .map(p => new THREE.Vector2(p[0], p[1]));
    const geo = new THREE.LatheGeometry(prof, 96); geo.rotateX(Math.PI / 2); return geo;
  }

  // Soft studio environment: strips of light the glass can reflect
  function buildEnvironment(renderer) {
    const env = new THREE.Scene(); env.background = new THREE.Color(0x030201);
    const panel = (hex, k, w, h, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(0xffffff, 2.2, 9, 2.2, [0, 6, 3]);
    panel(COL.sunset, 2.4, 3, 9, [-6, 0, 1]);
    panel(COL.vermillion, 2.0, 3, 9, [6, 0, 1]);
    panel(0xffffff, 0.9, 10, 2.5, [0, -5, 4]);
    panel(COL.cyan, 0.9, 2, 7, [3, 1, -6]);
    const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(env, 0.04); pm.dispose();
    env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE BUILDER
  // ═══════════════════════════════════════════════════════════════════════════
  function buildScene(canvas, dprCap) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 140);
    const envRT = buildEnvironment(renderer); scene.environment = envRT.texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.30));
    const lSunset = new THREE.PointLight(COL.sunset, 2.2, 30); lSunset.position.set(4, 3, 5); scene.add(lSunset);
    const lVerm = new THREE.PointLight(COL.vermillion, 1.7, 30); lVerm.position.set(-4, -2, 4); scene.add(lVerm);
    const lCyan = new THREE.PointLight(COL.cyan, 1.0, 24); lCyan.position.set(0, 5, 2); scene.add(lCyan);

    // Hierarchy: rig (dock/scene moves) → parallax (mouse) → coinGroup (tilt, crystal swap) → coinBody (boot spin)
    const rig = new THREE.Group(), parallax = new THREE.Group(), coinGroup = new THREE.Group(), coinBody = new THREE.Group();
    scene.add(rig); rig.add(parallax); parallax.add(coinGroup); coinGroup.add(coinBody);

    const COIN_R = 1.55, LENS_Z = 0.09;

    // 1. FRONT GLASS — dark tint + additive gloss layer (no transmission pass)
    const lensGeo = coinGeometry(COIN_R, 0.12, 0.05);
    const tintMat = new THREE.MeshBasicMaterial({ color: 0x0d0604, transparent: true, opacity: 0.34, depthWrite: false, toneMapped: false });
    const sheen = new THREE.Mesh(new THREE.CircleGeometry(COIN_R - 0.03, 96), new THREE.MeshBasicMaterial({
      map: sheenTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sheen.position.z = 0.064;
    const frontLens = new THREE.Group();
    frontLens.add(new THREE.Mesh(lensGeo, tintMat), sheen);
    frontLens.position.z = LENS_Z;

    // 2. BACK PLATE (titanium) + printed dial
    const matTitanium = new THREE.MeshStandardMaterial({ color: COL.titanium, metalness: 0.92, roughness: 0.3 });
    const backPlate = new THREE.Group();
    backPlate.add(new THREE.Mesh(coinGeometry(COIN_R, 0.10, 0.04), matTitanium));
    const dial = new THREE.Mesh(new THREE.CircleGeometry(COIN_R - 0.02, 96), new THREE.MeshBasicMaterial({ map: dialTexture(), toneMapped: false }));
    dial.position.z = 0.052; backPlate.add(dial);
    backPlate.position.z = -LENS_Z;

    // 3. RIM, NEON BEVEL, MILLED EDGE
    const rimMesh = new THREE.Mesh(new THREE.TorusGeometry(COIN_R + 0.012, 0.058, 20, 120), matTitanium);
    const neonBevelMat = new THREE.MeshBasicMaterial({ color: COL.vermillion, toneMapped: false });
    const neonBevelMesh = new THREE.Mesh(new THREE.TorusGeometry(COIN_R - 0.015, 0.014, 12, 120), neonBevelMat);
    neonBevelMesh.position.z = 0.1;
    const bevelGlow = new THREE.Mesh(new THREE.TorusGeometry(COIN_R - 0.015, 0.06, 12, 120),
      new THREE.MeshBasicMaterial({ color: COL.sunset, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    bevelGlow.position.z = 0.1;
    const milledPts = [];
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2, r1 = COIN_R + 0.02, r2 = COIN_R + 0.075;
      milledPts.push(Math.cos(a) * r1, Math.sin(a) * r1, -0.05, Math.cos(a) * r2, Math.sin(a) * r2, 0.05);
    }
    const milledGeo = new THREE.BufferGeometry(); milledGeo.setAttribute('position', new THREE.Float32BufferAttribute(milledPts, 3));
    const milledMesh = new THREE.LineSegments(milledGeo, new THREE.LineBasicMaterial({ color: COL.peach, transparent: true, opacity: 0.55 }));

    // 4. INNER CORE: neon double triangle + candlesticks + equity tube
    const centerCore = new THREE.Group();
    const neonOuter = createNeonTriangle(1.50, COL.sunset, 0.030);
    const neonInner = createNeonTriangle(1.08, COL.vermillion, 0.020);
    neonOuter.group.position.z = 0.03; neonInner.group.position.z = 0.03;
    const candlesticks = createCandlestickGroup(); candlesticks.position.z = 0.0;
    const rng = mulberry32(42), pts = []; let v = -0.32;
    for (let i = 0; i < 40; i++) {
      const x = ((i / 39) - 0.5) * 1.35;
      v = clamp(v + 0.026 + (rng() - 0.41) * 0.075, -0.45, 0.48);
      pts.push(new THREE.Vector3(x, v, 0.02 + (rng() - 0.5) * 0.03));
    }
    const TUBE_SEG = 160, TUBE_RAD = 6;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), TUBE_SEG, 0.016, TUBE_RAD, false), new THREE.MeshBasicMaterial({ color: COL.green, toneMapped: false }));
    const tubeIdxCount = tube.geometry.index.count; tube.geometry.setDrawRange(0, 0);
    centerCore.add(neonOuter.group, neonInner.group, candlesticks, tube);

    coinBody.add(frontLens, backPlate, rimMesh, neonBevelMesh, bevelGlow, milledMesh, centerCore);

    // 5. CRYSTAL MONOLITH (Scene 03): glass frustum + glowing edges + a candle cluster suspended inside
    const crystalGroup = new THREE.Group();
    const crystalGeo = new THREE.CylinderGeometry(1.25, 1.9, 2.3, 4); crystalGeo.rotateY(Math.PI / 4);
    crystalGroup.add(
      new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({ color: 0x120805, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })),
      new THREE.Mesh(crystalGeo, new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.12, metalness: 0, envMapIntensity: 0.9, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })),
      new THREE.LineSegments(new THREE.EdgesGeometry(crystalGeo), new THREE.LineBasicMaterial({ color: COL.peach, transparent: true, opacity: 0.9, toneMapped: false }))
    );
    const crystalCandles = createCandlestickGroup(); crystalCandles.scale.setScalar(1.25); crystalCandles.position.y = -0.1;
    crystalGroup.add(crystalCandles);
    crystalGroup.scale.setScalar(0.0001); parallax.add(crystalGroup);

    // 6. HALO + BURST FLARE
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,97,41,0.62)', 'rgba(252,59,0,0.16)'),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0
    }));
    halo.scale.set(6.4, 6.4, 1); halo.position.z = -0.7; parallax.add(halo);
    const centerFlare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,255,255,1)', 'rgba(255,97,41,0.3)'),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0
    }));
    centerFlare.scale.set(1.0, 1.0, 1); centerFlare.position.z = 0.25; coinBody.add(centerFlare);

    // 7. HUD RISK RINGS (Scene 06): rings + rotating tick bezel + "1.0% RISK"
    const hudGroup = new THREE.Group(); parallax.add(hudGroup);
    const hudMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const hudRing1 = new THREE.Mesh(new THREE.TorusGeometry(2.10, 0.012, 8, 160), hudMat(COL.sunset));
    const hudRing2 = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.008, 8, 160), hudMat(COL.cyan));
    const tickPts = [];
    for (let i = 0; i < 90; i++) { const a = (i / 90) * Math.PI * 2, r1 = 2.52, r2 = i % 5 === 0 ? 2.72 : 2.62; tickPts.push(Math.cos(a) * r1, Math.sin(a) * r1, 0, Math.cos(a) * r2, Math.sin(a) * r2, 0); }
    const tickGeo = new THREE.BufferGeometry(); tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
    const hudTicks = new THREE.LineSegments(tickGeo, new THREE.LineBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    const riskLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture('1.0% RISK', '#FF6129', 'rgba(18,10,7,0.85)', '#FC3B00'), transparent: true, opacity: 0, depthWrite: false }));
    riskLabel.scale.set(1.0, 0.34, 1); riskLabel.position.set(-2.75, 0.3, 0);
    hudGroup.add(hudRing1, hudRing2, hudTicks, riskLabel);

    // 8. ORBITAL R-MULTIPLE RINGS (Scene 07)
    const ringsGroup = new THREE.Group(); parallax.add(ringsGroup);
    const ringList = [];
    [
      [2.15, [1.15, 0.25, 0], COL.green, '+2.5R', '#22c55e', 0.58],
      [2.65, [-0.85, -0.45, 0.3], COL.cyan, '+3.8R', '#38bdf8', -0.45]
    ].forEach(([rad, tilt, hex, text, css, spin]) => {
      const holder = new THREE.Group(); holder.rotation.set(tilt[0], tilt[1], tilt[2]);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.014, 10, 200), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      node.position.set(rad, 0, 0);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, css, 'rgba(8,6,5,0.82)', css), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      label.scale.set(0.7, 0.24, 1); label.position.set(0.04, 0.26, 0); node.add(label);
      ring.add(node); holder.add(ring); ringsGroup.add(holder); ringList.push({ ring, node, label, spin });
    });
    ringsGroup.scale.setScalar(0.4);

    // 9. GRID TERRAIN (Scene 05): clean line grid displaced in the vertex shader, ember → cyan by height
    const GN = 56, GS = 64, GSIZE = 44, tPos = [];
    for (let i = 0; i <= GN; i++) {
      const a = (i / GN - 0.5) * GSIZE;
      for (let j = 0; j < GS; j++) {
        const b0 = (j / GS - 0.5) * GSIZE, b1 = ((j + 1) / GS - 0.5) * GSIZE;
        tPos.push(b0, 0, a, b1, 0, a);   // along X
        tPos.push(a, 0, b0, a, 0, b1);   // along Z
      }
    }
    const terrainGeo = new THREE.BufferGeometry(); terrainGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
    const terrainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAmp: { value: 0 }, uOpacity: { value: 0 }, uSunset: { value: new THREE.Color(1.0, 0.38, 0.16) }, uCyan: { value: new THREE.Color(0.22, 0.74, 0.97) } },
      vertexShader: `
        uniform float uTime, uAmp; varying float vH; varying float vD;
        float field(vec2 p, float t){
          float h = sin(p.x*0.42 + t*0.65)*0.5 + sin(p.y*0.36 - t*0.45)*0.5;
          h += sin((p.x+p.y)*0.7 + t*0.95)*0.25; h += sin(length(p)*0.55 - t*0.8)*0.4; return h;
        }
        void main(){
          vec3 pos = position; float h = field(pos.xz, uTime); pos.y += h*uAmp; vH = h; vD = length(pos.xz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }`,
      fragmentShader: `
        uniform float uOpacity; uniform vec3 uSunset, uCyan; varying float vH; varying float vD;
        void main(){
          vec3 c = mix(uSunset, uCyan, smoothstep(-0.5, 0.7, vH));
          float fade = 1.0 - smoothstep(6.0, 20.0, vD);
          float a = uOpacity * fade * (0.30 + 0.70*smoothstep(-0.8, 0.9, vH));
          gl_FragColor = vec4(c * 1.35, a);
        }`,
    });
    const terrain = new THREE.LineSegments(terrainGeo, terrainMat);
    terrain.position.set(0, -9, -2); terrain.frustumCulled = false; scene.add(terrain);

    // 10. SHOCKWAVE (Scene 10)
    const shockwaveRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.2, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COL.sunset, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    shockwaveRing.position.set(0, -1.35, 0); scene.add(shockwaveRing);

    // 11. ANALYTICS BADGES (Scene 12)
    const winRateBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: circularBadgeTexture('70%', 'WIN RATE', '#22c55e', '#22c55e'), transparent: true, opacity: 0, depthWrite: false }));
    winRateBadge.scale.set(1.0, 1.0, 1); winRateBadge.position.set(-2.5, 0.3, 0);
    const pfBadge = new THREE.Sprite(new THREE.SpriteMaterial({ map: circularBadgeTexture('2.4', 'PROFIT FACTOR', '#38bdf8', '#38bdf8'), transparent: true, opacity: 0, depthWrite: false }));
    pfBadge.scale.set(1.0, 1.0, 1); pfBadge.position.set(2.5, 0.3, 0);
    parallax.add(winRateBadge, pfBadge);
    const greenRing = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.022, 10, 160).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: COL.green, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    greenRing.position.y = -1.2; parallax.add(greenRing);

    // 12. MULTI-PORTFOLIO PEDESTALS (Scene 13)
    const pedestalGroup = new THREE.Group(); scene.add(pedestalGroup);
    const pedGeo = new THREE.CylinderGeometry(1.2, 1.35, 0.35, 48);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x110e0c, metalness: 0.85, roughness: 0.25 });
    const pedRimMat = new THREE.MeshBasicMaterial({ color: COL.sunset, transparent: true, opacity: 0.8, toneMapped: false });
    [-3.5, 0, 3.5].forEach(x => {
      const p = new THREE.Mesh(pedGeo, pedMat); p.position.set(x, -1.9, 0); pedestalGroup.add(p);
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.012, 8, 64).rotateX(Math.PI / 2), pedRimMat); r.position.set(x, -1.72, 0); pedestalGroup.add(r);
    });
    pedestalGroup.position.y = -6;
    const cloneLeft = coinBody.clone(), cloneRight = coinBody.clone();
    cloneLeft.scale.setScalar(0.0001); cloneRight.scale.setScalar(0.0001);
    cloneLeft.position.set(-3.5, 0, 0); cloneRight.position.set(3.5, 0, 0);
    parallax.add(cloneLeft, cloneRight);

    // 13. BLUEPRINT FLOOR (Scene 14)
    const blueprintFloor = new THREE.Mesh(new THREE.PlaneGeometry(28, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: createBlueprintTexture(), transparent: true, opacity: 0, depthWrite: false }));
    blueprintFloor.position.y = -1.35; scene.add(blueprintFloor);

    // 14. DASHBOARD TABLET (Scene 15)
    const dashboardTablet = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 5.2).rotateX(-Math.PI / 2.3),
      new THREE.MeshStandardMaterial({ map: createDashboardTexture(), color: 0xffffff, emissive: COL.sunset, emissiveIntensity: 0.14, roughness: 0.25, metalness: 0.5, transparent: true, opacity: 0 }));
    dashboardTablet.position.set(0, -1.75, -0.4); scene.add(dashboardTablet);

    // 15. AMBIENT MOTES
    const PN = 320, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3);
    const pr = mulberry32(77), gold = new THREE.Color(COL.gold), snt = new THREE.Color(COL.sunset), tmp = new THREE.Color();
    for (let i = 0; i < PN; i++) {
      pPos[i * 3] = (pr() - 0.5) * 24; pPos[i * 3 + 1] = (pr() - 0.5) * 13; pPos[i * 3 + 2] = -16 + pr() * 26;
      tmp.copy(gold).lerp(snt, pr() > 0.5 ? pr() : 0); pCol.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.13, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending, map: glowSpriteTexture('rgba(255,255,255,1)', 'rgba(255,179,71,0.45)'),
    }));
    particles.frustumCulled = false; scene.add(particles);

    // 16. WARP STREAKS (Scene 09) — v2 never initialised x/y so every streak collapsed into one line
    const SN = 260, sPos = new Float32Array(SN * 6), sBase = new Float32Array(SN * 3), sr = mulberry32(2025);
    for (let i = 0; i < SN; i++) {
      const a = sr() * Math.PI * 2, r = 0.9 + Math.pow(sr(), 0.7) * 8, z = -22 + sr() * 30;
      sBase[i * 3] = Math.cos(a) * r; sBase[i * 3 + 1] = Math.sin(a) * r * 0.62; sBase[i * 3 + 2] = z;
    }
    const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const streaks = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({ color: 0xffa070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    streaks.frustumCulled = false; scene.add(streaks);

    // 17. BURST SPARKS (Scene 08)
    const BN = 240, bDir = new Float32Array(BN * 4), bPos = new Float32Array(BN * 3), br = mulberry32(88);
    for (let i = 0; i < BN; i++) {
      const th = br() * Math.PI * 2, ph = Math.acos(2 * br() - 1);
      bDir[i * 4] = Math.sin(ph) * Math.cos(th); bDir[i * 4 + 1] = Math.sin(ph) * Math.sin(th) * 0.8; bDir[i * 4 + 2] = Math.cos(ph) * 0.6;
      bDir[i * 4 + 3] = 2.2 + br() * 5.5;
    }
    const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    const burst = new THREE.Points(bGeo, new THREE.PointsMaterial({
      size: 0.16, sizeAttenuation: true, color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, map: glowSpriteTexture('rgba(255,255,255,1)', 'rgba(255,140,60,0.55)'),
    }));
    burst.frustumCulled = false; burst.position.z = 0.4; rig.add(burst);

    return {
      renderer, scene, camera, envRT, rig, parallax, coinGroup, coinBody, lights: { lSunset, lVerm, lCyan },
      frontLens, backPlate, rimMesh, neonBevelMesh, milledMesh, centerCore, tube,
      tubeIdx: { count: tubeIdxCount, seg: TUBE_SEG, rad: TUBE_RAD },
      neon: [{ set: neonOuter, from: new THREE.Color(COL.sunset), to: new THREE.Color(COL.green) },
             { set: neonInner, from: new THREE.Color(COL.vermillion), to: new THREE.Color(COL.mint) }],
      crystalGroup, halo, centerFlare, hudGroup, hudRing1, hudRing2, hudTicks, riskLabel,
      ringsGroup, ringList, terrain, terrainMat, shockwaveRing, greenRing,
      winRateBadge, pfBadge, pedestalGroup, cloneLeft, cloneRight,
      blueprintFloor, dashboardTablet, particles, pGeo, pPos, PN,
      streaks, sGeo, sPos, sBase, SN, burst, bGeo, bPos, bDir, BN, LENS_Z, COIN_R
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  UI HELPERS (loader, chapter rail, hero split, curtain)
  // ═══════════════════════════════════════════════════════════════════════════
  function makeLoader(total) {
    const fill = $('scrolly-loader-fill'), pct = $('scrolly-loader-pct');
    let done = 0;
    return function tick() {
      done = Math.min(total, done + 1);
      const p = Math.round((done / total) * 100);
      if (fill) fill.style.transform = `scaleX(${p / 100})`;
      if (pct) pct.textContent = p + '%';
    };
  }
  function hideLoader() {
    document.documentElement.classList.remove('intro-loading');
    const l = $('scrolly-loader'); if (l) { l.classList.add('done'); setTimeout(() => l.remove(), 700); }
  }

  function splitWords(el, force = false) {
    if (!el || (!force && el.dataset.split)) return [];
    const words = el.textContent.trim().split(/\s+/);
    el.setAttribute('aria-label', el.textContent.trim());
    el.innerHTML = words.map(w => `<span class="w" aria-hidden="true"><span class="wi">${w}</span></span>`).join(' ');
    el.dataset.split = '1';
    return Array.from(el.querySelectorAll('.wi'));
  }

  function buildChapterRail(run) {
    const nav = $('scrolly-chapters'); if (!nav) return;
    nav.innerHTML = '';
    CHAPTERS.forEach((c, i) => {
      const name = chName(c);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ch'; b.dataset.i = i;
      b.setAttribute('aria-label', tr('intro.jumpChapter', { i: i + 1, name }));
      b.innerHTML = `<span class="ch-n">${String(i + 1).padStart(2, '0')}</span><span class="ch-t">${name}</span>`;
      b.addEventListener('click', () => jumpTo(run, c.t - 0.5));
      nav.appendChild(b);
    });
    run.chBtns = Array.from(nav.children);
    if (run.chIdx >= 0) {
      run.chBtns.forEach((b, i) => { b.classList.toggle('on', i === run.chIdx); b.classList.toggle('past', i < run.chIdx); if (i === run.chIdx) b.setAttribute('aria-current', 'step'); });
    }
  }

  function updateChapter(run, p) {
    let idx = -1;
    for (let i = 0; i < CHAPTERS.length; i++) if (p >= CHAPTERS[i].t - 1.5) idx = i;
    const railOn = p <= 98;   // docking / handover: the rail steps aside
    if (railOn !== run.railOn) { run.railOn = railOn; document.documentElement.classList.toggle('intro-rail-on', railOn); }
    if (idx === run.chIdx) return;
    run.chIdx = idx;
    run.chBtns.forEach((b, i) => { b.classList.toggle('on', i === idx); b.classList.toggle('past', i < idx); if (i === idx) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    const live = $('scrolly-live'); if (live && idx >= 0) live.textContent = tr('intro.liveChapter', { i: idx + 1, n: CHAPTERS.length, name: chName(CHAPTERS[idx]) });
  }

  function refreshLang() {
    const heroEl = document.querySelector('#frame-1 .hero-title');
    if (heroEl) splitWords(heroEl, true);
    if (S.run) buildChapterRail(S.run);
  }

  function jumpTo(run, t) {
    if (!run.st) return;
    const y = run.st.start + (clamp(t, 0, 100) / 100) * (run.st.end - run.st.start);
    if (run.lenis) run.lenis.scrollTo(y, { duration: 1.6 }); else window.scrollTo({ top: y, behavior: 'auto' });
  }

  function makeCurtain() {
    let c = $('scrolly-curtain');
    if (!c) { c = document.createElement('div'); c.id = 'scrolly-curtain'; c.className = 'scrolly-curtain'; document.body.appendChild(c); }
    return c;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TIMELINE & 16-SCENE CONTINUOUS ANIMATION
  // ═══════════════════════════════════════════════════════════════════════════
  const QUALITY_DPR = [2, 1.5, 1, 0.75];   // adaptive ladder, index = level

  function start() {
    const container = $('scrolly-container'), canvas = $('webgl-canvas');
    const isSmall = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
    const forced = qs.get('q');
    let level = forced !== null ? clamp(parseInt(forced, 10) || 0, 0, 3) : (isSmall || (navigator.hardwareConcurrency || 8) <= 4 ? 1 : 0);

    if (qs.get('debug')) window.__TT = S;   // dev hook: inspect the scene graph from the console
    const run = S.run = {
      container, canvas, raf: 0, last: performance.now(), t: 0, renderOn: true,
      listeners: [], mouse: { x: 0, y: 0, tx: 0, ty: 0 }, ema: 1 / 60, frames: 0,
      q: { level, locked: forced !== null }, chIdx: -2, chBtns: [], grade: { g: 0, applied: -1 },
    };
    const sc = run.sc = buildScene(canvas, QUALITY_DPR[level]), { renderer, scene, camera } = sc;
    const aspect = () => canvas.clientWidth / canvas.clientHeight;
    // Landscape: coin ≈ 57% of viewport height. Portrait: widen until the coin fits ~62% of the width.
    const baseZ = () => Math.max(7.0, 6.4 / aspect());
    // Side-by-side layout offset: on portrait screens the cards sit at the bottom, so the object stays centred
    const sideX = () => (aspect() < 1 ? 0 : 1.9);

    const cam = run.cam = { x: 0, y: 0, z: baseZ(), lookY: 0 };
    const PK = run.PK = { v: 1.0 };      // mouse parallax strength
    const RS = run.RS = { speed: 0.9 };  // ring spin
    const RF = run.RF = { v: 0 };        // ring fade
    const P = run.P = { speed: 0.9 };    // particle speed
    const DRAW = run.DRAW = { v: 0 };    // equity tube draw
    const BURST = run.BURST = { v: 0, a: 0 };
    const WARP = run.WARP = { v: 0 };

    // Dock target (nav logo) → world position/scale, so the coin lands exactly on the real logo
    function dockInfo() {
      const target = document.querySelector('.app-nav-rail .nav-logo.logo-mark') || document.querySelector('.nav-logo') || document.querySelector('.logo-mark');
      if (!target) return { x: -2.2, y: 1.8, s: 0.18 };
      const r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dc = new THREE.PerspectiveCamera(camera.fov, aspect(), camera.near, camera.far);
      dc.position.set(0, 0, baseZ()); dc.lookAt(0, 0, 0); dc.updateMatrixWorld(true); dc.updateProjectionMatrix();
      const ndc = new THREE.Vector3((cx / canvas.clientWidth) * 2 - 1, -(cy / canvas.clientHeight) * 2 + 1, 0.5).unproject(dc);
      const dir = ndc.sub(dc.position).normalize(), t = -dc.position.z / dir.z, w = dc.position.clone().add(dir.multiplyScalar(t));
      const upx = (2 * Math.tan(THREE.MathUtils.degToRad(dc.fov / 2)) * dc.position.z) / canvas.clientHeight;
      return { x: w.x, y: w.y, s: (Math.max(r.width, r.height) * upx) / (sc.COIN_R * 2) };
    }

    sc.rig.position.set(0, 0.5, 0);
    buildChapterRail(run);
    const heroWords = splitWords(document.querySelector('#frame-1 .hero-title'));

    // ─── MASTER SCRUB TIMELINE (positions are 0–100 = % of scroll) ──────────
    const tl = run.tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: container, start: 'top top', end: 'bottom bottom', scrub: 0.8, invalidateOnRefresh: true,
        onUpdate: self => {
          const bar = $('scrolly-progress'); if (bar) bar.style.transform = `scaleX(${self.progress})`;
          updateChapter(run, self.progress * 100);
        },
        onToggle: self => { run.renderOn = self.isActive; },
        onLeave: () => finish({ seen: true }),
      },
    });
    run.st = tl.scrollTrigger;

    const rot = sc.coinGroup.rotation, rp = sc.rig.position, rs = sc.rig.scale;
    const fade = (sel, at, dur = 3, out = at + 8) => {
      tl.fromTo(sel, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: dur, ease: 'power2.out' }, at);
      tl.to(sel, { autoAlpha: 0, y: -28, duration: dur, ease: 'power2.in' }, out);
    };

    // 01 → 02 (0–6.5): awaken + 3D tilt. Hero copy leaves early so it never fights the coin.
    tl.to('#frame-1', { autoAlpha: 0, y: -40, duration: 4 }, 2);
    tl.to(rot, { x: 0.16, y: -0.5, z: 0.08, duration: 6.5 }, 0);
    tl.to(rp, { y: 0.15, duration: 6.5 }, 0);

    // 02 → 03 (6.5–13): coin dissolves into a crystal monolith; macro push-in
    tl.to(cam, { z: () => baseZ() * 0.84, duration: 6.5 }, 6.5);
    tl.to(rot, { x: 0.06, y: -0.2, z: 0.02, duration: 6.5 }, 6.5);
    tl.to(sc.coinGroup.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: 3.6, ease: 'power3.in' }, 7);
    tl.to(sc.crystalGroup.scale, { x: 1, y: 1, z: 1, duration: 4, ease: 'power3.out' }, 8);
    tl.to(sc.crystalGroup.rotation, { y: Math.PI * 1.5, duration: 12, ease: 'none' }, 7.5);
    fade('#frame-3', 10.5, 2.5, 17.5);
    tl.to(rp, { x: () => sideX(), duration: 5 }, 8);            // Record (card left) → object right

    // 03 → 04 (13–19.5): crystal resolves back into the coin, isometric tilt, low horizon
    tl.to(sc.crystalGroup.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: 3.4, ease: 'power3.in' }, 13.4);
    tl.to(sc.coinGroup.scale, { x: 1, y: 1, z: 1, duration: 4.2, ease: 'back.out(1.5)' }, 14.4);
    tl.to(cam, { z: () => baseZ() * 0.98, duration: 6.5 }, 13);
    tl.to(rot, { x: 0.38, y: -0.92, z: 0.18, duration: 6.5 }, 13);

    // 04 → 05 (19.5–26): lift-off over the topographic grid
    tl.to(rp, { y: 0.3, duration: 6.5 }, 19.5);
    tl.to(sc.terrain.position, { y: -2.6, duration: 6.5 }, 19.5);
    tl.to(sc.terrainMat.uniforms.uAmp, { value: 1.0, duration: 6.5 }, 19.5);
    tl.to(sc.terrainMat.uniforms.uOpacity, { value: 1.0, duration: 5 }, 19.5);
    fade('#frame-5', 20, 2.5, 27);

    // 05 → 06 (26–32.5): risk HUD, then it clears before the next chapter's text
    tl.to(rot, { x: 0.05, y: -0.1, z: 0, duration: 6.5 }, 26);
    tl.to([sc.hudRing1.material, sc.hudRing2.material, sc.hudTicks.material, sc.riskLabel.material], { opacity: 1, duration: 4 }, 26);
    tl.to([sc.hudRing1.material, sc.hudRing2.material, sc.hudTicks.material, sc.riskLabel.material], { opacity: 0, duration: 3 }, 33);

    // 06 → 07 (32.5–39): +2.5R / +3.8R orbital rings
    tl.to(RF, { v: 1, duration: 4 }, 32.5);
    tl.to(sc.ringsGroup.scale, { x: 1, y: 1, z: 1, duration: 6.5 }, 32.5);
    tl.to(RS, { speed: 2.2, duration: 6.5 }, 32.5);
    tl.to(rot, { x: 0.22, y: 0.5, z: 0.05, duration: 6.5 }, 32.5);
    fade('#frame-7', 33, 2.5, 40);
    tl.to(rp, { x: () => -sideX(), duration: 5 }, 30.5);        // Returns (card right) → object left
    tl.to(rp, { x: 0, duration: 4 }, 40.5);           // burst + warp stay centred

    // 07 → 08 (39–45.5): centrifugal burst
    tl.to(RF, { v: 0, duration: 3 }, 41.5);
    tl.to(sc.centerFlare.material, { opacity: 1, duration: 2.5 }, 39);
    tl.to(sc.centerFlare.scale, { x: 5.2, y: 5.2, duration: 4 }, 39);
    tl.to(BURST, { v: 1, duration: 6.5, ease: 'power2.out' }, 39);
    tl.fromTo(BURST, { a: 0 }, { a: 1, duration: 1.2, ease: 'none', immediateRender: false }, 39);
    tl.to(BURST, { a: 0, duration: 4, ease: 'none' }, 42.5);
    tl.to(P, { speed: 6.0, duration: 6.5 }, 39);

    // 08 → 09 (45.5–52): hyperspace warp
    tl.to(sc.centerFlare.material, { opacity: 0, duration: 2 }, 45.5);
    tl.to(WARP, { v: 1, duration: 3, ease: 'power2.out' }, 45.5);
    tl.to(sc.streaks.material, { opacity: 0.95, duration: 2 }, 45.5);
    tl.to(P, { speed: 14.0, duration: 6.5 }, 45.5);
    tl.to(cam, { z: () => baseZ() * 0.78, duration: 6.5 }, 45.5);

    // 09 → 10 (52–58.5): deceleration + shockwave
    tl.to(P, { speed: 0.5, duration: 4 }, 52);
    tl.to(WARP, { v: 0, duration: 4 }, 52);
    tl.to(sc.streaks.material, { opacity: 0, duration: 3 }, 52);
    tl.to(cam, { z: () => baseZ() * 0.95, duration: 6 }, 52);
    tl.to(sc.shockwaveRing.material, { opacity: 0.9, duration: 1.5 }, 52);
    tl.to(sc.shockwaveRing.scale, { x: 30, y: 30, z: 30, duration: 6 }, 52);
    tl.to(sc.shockwaveRing.material, { opacity: 0, duration: 4 }, 54);

    // 10 → 11 (58.5–65): exploded 3-layer audit; neon turns green
    tl.to(sc.frontLens.position, { z: () => sc.LENS_Z + 1.25, duration: 6.5 }, 58.5);
    tl.to(sc.backPlate.position, { z: () => -sc.LENS_Z - 1.25, duration: 6.5 }, 58.5);
    tl.to(sc.centerCore.scale, { z: 2.8, duration: 6.5 }, 58.5);
    tl.to(DRAW, { v: 1, duration: 6.5, ease: 'none', onUpdate: () => {
      const n = Math.floor(DRAW.v * sc.tubeIdx.seg) * sc.tubeIdx.rad * 6; sc.tube.geometry.setDrawRange(0, n);
    } }, 58.5);
    tl.to(run.grade, { g: 1, duration: 4 }, 59);
    tl.to(rot, { x: 0.34, y: -1.0, z: 0.12, duration: 6.5 }, 58.5);
    fade('#frame-11', 59, 2.5, 66);
    tl.to(rp, { x: () => sideX(), duration: 4 }, 57.5);         // Audit (card left) → object right
    tl.to(rp, { x: 0, duration: 4 }, 66.5);

    // 11 → 12 (65–71.5): win-rate & profit-factor badges; layers re-assemble
    tl.to([sc.winRateBadge.material, sc.pfBadge.material], { opacity: 1, duration: 3 }, 66);
    tl.to(sc.greenRing.material, { opacity: 0.85, duration: 3 }, 66);
    tl.to(sc.frontLens.position, { z: sc.LENS_Z, duration: 4, ease: 'power3.in' }, 67.5);
    tl.to(sc.backPlate.position, { z: -sc.LENS_Z, duration: 4, ease: 'power3.in' }, 67.5);
    tl.to(sc.centerCore.scale, { z: 1.0, duration: 4, ease: 'power3.in' }, 67.5);
    tl.to(run.grade, { g: 0, duration: 4 }, 68);

    // 12 → 13 (71.5–78): triplicate on pedestals
    tl.to([sc.winRateBadge.material, sc.pfBadge.material, sc.greenRing.material], { opacity: 0, duration: 2 }, 71.5);
    tl.to(rot, { x: 0.04, y: 0, z: 0, duration: 5 }, 71.5);
    tl.to(sc.pedestalGroup.position, { y: 0, duration: 6.5 }, 71.5);
    tl.to(sc.cloneLeft.scale, { x: 1, y: 1, z: 1, duration: 5, ease: 'back.out(1.6)' }, 72.5);
    tl.to(sc.cloneRight.scale, { x: 1, y: 1, z: 1, duration: 5, ease: 'back.out(1.6)' }, 73.5);
    fade('#frame-13', 72, 2.5, 79);
    tl.to(cam, { z: () => baseZ() * 1.22, duration: 5 }, 71.5);   // pull back: three coins + headline above
    tl.to(rp, { y: -0.45, duration: 5 }, 71.5);

    // 13 → 14 (78–84.5): blueprint circuit floor
    tl.to([sc.cloneLeft.scale, sc.cloneRight.scale], { x: 0.0001, y: 0.0001, z: 0.0001, duration: 4 }, 78);
    tl.to(sc.pedestalGroup.position, { y: -6, duration: 5 }, 78);
    tl.to(sc.blueprintFloor.material, { opacity: 0.85, duration: 6.5 }, 78);
    tl.to(sc.terrainMat.uniforms.uOpacity, { value: 0, duration: 4 }, 78);
    tl.to(cam, { y: 2.5, lookY: -0.4, z: () => baseZ() * 0.9, duration: 6.5 }, 78);
    tl.to(rp, { y: 0.25, duration: 6 }, 78);
    tl.to(rot, { x: -1.2, y: 0, z: 0, duration: 6.5 }, 78);

    // 14 → 15 (84.5–91): approach the dashboard plane
    tl.to(sc.dashboardTablet.material, { opacity: 0.92, duration: 5 }, 84.5);
    tl.to(rp, { y: 0.25, duration: 6.5 }, 84.5);
    fade('#frame-15', 85, 2.5, 90.5);

    // 15 → 16 (91–100): dock into the real nav logo
    tl.to(cam, { x: 0, y: 0, z: () => baseZ(), lookY: 0, duration: 8 }, 91);
    tl.to(rot, { x: 0, y: 0, z: 0, duration: 7 }, 91);
    tl.to(rp, { x: () => dockInfo().x, y: () => dockInfo().y, z: 0, duration: 9, ease: 'power3.inOut' }, 91);
    tl.to(rs, { x: () => dockInfo().s, y: () => dockInfo().s, z: () => dockInfo().s, duration: 9, ease: 'power3.inOut' }, 91);
    tl.to(sc.blueprintFloor.material, { opacity: 0, duration: 4 }, 91);
    tl.to(sc.dashboardTablet.material, { opacity: 0, duration: 4 }, 91);
    tl.to(sc.particles.material, { opacity: 0, duration: 4 }, 93);
    tl.to(sc.halo.material, { opacity: 0, duration: 5 }, 93);
    tl.to(PK, { v: 0, duration: 8 }, 91);
    tl.fromTo('#frame-16', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 2.5, ease: 'power2.out' }, 96.5);
    tl.to('.nav-logo', { opacity: 1, duration: 2 }, 98);
    tl.to(canvas, { opacity: 0, duration: 2 }, 98);
    tl.set({}, {}, 100);

    // Smooth scrolling (optional): lerp-based so it doesn't stack on top of the scrub smoothing
    if (window.Lenis) {
      run.lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      run.lenis.on('scroll', ScrollTrigger.update);
    }

    // ─── BOOT: one orchestrated entrance (coin spins in, hero words rise) ─────
    sc.coinBody.scale.setScalar(0.0001); sc.coinBody.rotation.y = -Math.PI * 1.4;
    gsap.set('.scroll-indicator', { autoAlpha: 0 });
    gsap.set(heroWords, { yPercent: 115 });
    const boot = run.boot = gsap.timeline({ delay: 0.15 });
    boot.to(sc.coinBody.scale, { x: 1, y: 1, z: 1, duration: 1.5, ease: 'expo.out' }, 0)
        .to(sc.coinBody.rotation, { y: 0, duration: 2.2, ease: 'expo.out' }, 0)
        .to(sc.halo.material, { opacity: 0.55, duration: 2 }, 0.2)
        .to(heroWords, { yPercent: 0, duration: 1.1, stagger: 0.09, ease: 'power4.out' }, 0.5)
        .to('#frame-1 .hero-subtitle', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power2.out' }, 1.1)
        .to('.scroll-indicator', { autoAlpha: 1, duration: 0.8 }, 1.6);
    gsap.set('#frame-1 .hero-subtitle', { autoAlpha: 0, y: 12 });

    // ─── Listeners ──────────────────────────────────────────────────────────
    const on = (t, e, f, o) => { t.addEventListener(e, f, o); run.listeners.push([t, e, f, o]); };
    on(window, 'pointermove', e => {
      run.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      run.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
    on(window, 'resize', () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      camera.aspect = aspect(); camera.updateProjectionMatrix();
      if (run.renderOn) renderer.render(scene, camera);
    });
    on(window, 'keydown', e => { if (e.key === 'Escape') skip(); });
    on(canvas, 'webglcontextlost', e => { e.preventDefault(); finish({ seen: false }); });

    window.scrollTo(0, 0);
    camera.aspect = aspect(); camera.updateProjectionMatrix();
    ScrollTrigger.refresh();
    hideLoader();
    run.raf = requestAnimationFrame(frame);
  }

  // ─── ADAPTIVE QUALITY ───────────────────────────────────────────────────────
  function applyQuality(run) {
    const { renderer, camera } = run.sc, c = run.canvas;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_DPR[run.q.level]));
    renderer.setSize(c.clientWidth, c.clientHeight, false);
    camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix();
  }

  // ─── PER-FRAME RENDER LOOP ──────────────────────────────────────────────────
  function frame(now) {
    const run = S.run; if (!run) return;
    run.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    if (run.lenis) run.lenis.raf(now);
    if (!run.renderOn) return;

    run.t += dt;
    const sc = run.sc, { scene, camera, renderer, parallax, ringList, terrainMat, pPos, PN, sPos, sBase, SN, bPos, bDir, BN } = sc;

    // Adaptive quality: step the pixel-ratio ladder down when the frame time stays high
    run.ema += (dt - run.ema) * 0.08; run.frames++;
    if (!run.q.locked && run.frames > 50 && run.ema > 1 / 27 && run.q.level < QUALITY_DPR.length - 1) {
      run.q.level++; applyQuality(run); run.frames = 0; run.ema = 1 / 60;
    }

    camera.position.set(run.cam.x, run.cam.y, run.cam.z);
    camera.lookAt(0, run.cam.lookY, 0);

    // Mouse parallax + a slow idle float
    run.mouse.x += (run.mouse.tx - run.mouse.x) * 0.08;
    run.mouse.y += (run.mouse.ty - run.mouse.y) * 0.08;
    const pk = run.PK.v;
    parallax.position.x = run.mouse.x * 0.22 * pk;
    parallax.position.y = -run.mouse.y * 0.16 * pk + Math.sin(run.t * 0.9) * 0.05 * pk;
    parallax.rotation.y = run.mouse.x * 0.18 * pk;
    parallax.rotation.x = -run.mouse.y * 0.12 * pk;

    // Neon colour grade (orange ↔ green in the audit chapter)
    if (run.grade.g !== run.grade.applied) {
      run.grade.applied = run.grade.g;
      sc.neon.forEach(n => n.set.mats.forEach(m => m.color.copy(n.from).lerp(n.to, run.grade.g)));
      sc.lights.lSunset.color.setHex(COL.sunset).lerp(new THREE.Color(COL.green), run.grade.g * 0.5);
    }

    // HUD
    sc.hudRing1.rotation.z += dt * 0.25; sc.hudTicks.rotation.z -= dt * 0.18;
    sc.greenRing.rotation.y += dt * 0.6;

    // Rings
    ringList.forEach(r => {
      r.ring.rotation.z += dt * run.RS.speed * r.spin;
      r.ring.material.opacity = run.RF.v * 0.85; r.node.material.opacity = run.RF.v * 0.95; r.label.material.opacity = run.RF.v * 0.95;
    });

    terrainMat.uniforms.uTime.value = run.t;

    // Motes
    const pSpeed = run.P.speed;
    for (let i = 0; i < PN; i++) { let z = pPos[i * 3 + 2] + dt * pSpeed; if (z > 9) z = -16; pPos[i * 3 + 2] = z; }
    sc.pGeo.attributes.position.needsUpdate = true;

    // Warp streaks: every streak flies toward the camera; length grows with WARP
    if (sc.streaks.material.opacity > 0.01) {
      const len = 0.8 + run.WARP.v * 5.5;
      for (let i = 0; i < SN; i++) {
        let z = sBase[i * 3 + 2] + dt * (6 + pSpeed * 2.4); if (z > 9) z = -22;
        sBase[i * 3 + 2] = z;
        const x = sBase[i * 3], y = sBase[i * 3 + 1];
        sPos[i * 6] = x; sPos[i * 6 + 1] = y; sPos[i * 6 + 2] = z;
        sPos[i * 6 + 3] = x; sPos[i * 6 + 4] = y; sPos[i * 6 + 5] = z - len;
      }
      sc.sGeo.attributes.position.needsUpdate = true;
    }

    // Burst sparks
    if (run.BURST.a > 0.01) {
      const bt = run.BURST.v;
      for (let i = 0; i < BN; i++) {
        const k = bDir[i * 4 + 3] * bt;
        bPos[i * 3] = bDir[i * 4] * k; bPos[i * 3 + 1] = bDir[i * 4 + 1] * k; bPos[i * 3 + 2] = bDir[i * 4 + 2] * k;
      }
      sc.bGeo.attributes.position.needsUpdate = true;
    }
    sc.burst.material.opacity = run.BURST.a;

    renderer.render(scene, camera);
  }

  // ─── TEARDOWN & FINISH ──────────────────────────────────────────────────────
  function finish({ seen = true, jumpTop = false } = {}) {
    if (S.finishing || S.phase === 'done') return;
    S.finishing = true; S.phase = 'done';
    if (seen) markSeen();

    const container = $('scrolly-container');
    // Preserve the visual position: the dashboard starts (container height − 100vh) down the page,
    // so any scroll beyond that is carried over instead of snapping to the top.
    let carry = 0;
    if (!jumpTop && container) carry = Math.max(0, window.scrollY - Math.max(0, container.offsetHeight - window.innerHeight));

    const run = S.run;
    if (run) {
      cancelAnimationFrame(run.raf);
      run.listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
      if (run.boot) run.boot.kill();
      if (run.st) run.st.kill();
      if (run.tl) run.tl.kill();
      if (run.lenis) run.lenis.destroy();
      const sc = run.sc;
      if (sc) {
        sc.scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
          }
        });
        sc.envRT.dispose(); sc.renderer.dispose();
      }
    }

    document.documentElement.classList.remove('intro-active', 'intro-loading', 'intro-rail-on');
    container && container.remove();
    document.body.style.overflow = '';
    window.scrollTo(0, carry);
  }

  // Skip: cover with a curtain, swap, reveal — no hard cut from 3D to the dashboard
  function skip() {
    if (S.phase === 'done' || S.finishing || S.skipping) return;
    S.skipping = true;
    const cur = makeCurtain();
    requestAnimationFrame(() => cur.classList.add('on'));
    setTimeout(() => {
      finish({ seen: true, jumpTop: true });
      requestAnimationFrame(() => { cur.classList.remove('on'); setTimeout(() => cur.remove(), 600); });
    }, 300);
  }
  window.skipToDashboard = skip;

  // ─── PREPARE / BOOT (idempotent: auth events call this repeatedly) ──────────
  async function prepare() {
    if (S.phase !== 'idle') return;
    if (!shouldPlay()) { S.phase = 'done'; const c = $('scrolly-container'); c && c.remove(); return; }
    S.phase = 'loading';
    document.documentElement.classList.add('intro-active', 'intro-loading');
    try {
      await loadLibs(makeLoader(5));
      if (S.phase !== 'loading') return;      // skipped / torn down while loading
      start();
      S.phase = 'playing';
    } catch (err) {
      console.warn('Scrolly3D fallback:', err);
      S.phase = 'idle'; finish({ seen: false });
    }
  }

  // Exposed for auth.js
  // teardown = "user logged out mid-intro". While idle it must do nothing, so a first-time user who
  // registers in this very session still gets the intro after login (v2 removed the container instead).
  window.ScrollyIntro = { prepare, skip, refreshLang, teardown: () => { if (S.phase === 'loading' || S.phase === 'playing') finish({ seen: false }); } };
})();
