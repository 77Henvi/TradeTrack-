/*
   TrackTrade: 9-scene linked 3D scrollytelling intro (story mode).
   One coin, one camera on a Catmull-Rom spline, handing each scene directly to the next.
*/
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
      need('Lenis', CDN.lenis).catch(() => { tick(); console.warn('Lenis unavailable, using native scroll'); }),
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

  // Candlestick cluster (Scene 01 to 03)
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
    // bottom to top: LatheGeometry only yields outward-facing normals in this order
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

    // Hierarchy: rig (dock/scene moves) to parallax (mouse) to coinGroup (tilt, crystal swap) to coinBody (boot spin)
    const rig = new THREE.Group(), parallax = new THREE.Group(), coinGroup = new THREE.Group(), coinBody = new THREE.Group();
    scene.add(rig); rig.add(parallax); parallax.add(coinGroup); coinGroup.add(coinBody);

    const COIN_R = 1.55, LENS_Z = 0.09;

    // 1. FRONT GLASS. Dark tint + additive gloss layer (no transmission pass)
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

    // 5. HALO
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,97,41,0.62)', 'rgba(252,59,0,0.16)'),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0
    }));
    halo.scale.set(6.4, 6.4, 1); halo.position.z = -0.7; parallax.add(halo);

    // 6. AMBIENT MOTES
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

    return {
      renderer, scene, camera, envRT, rig, parallax, coinGroup, coinBody, lights: { lSunset, lVerm, lCyan },
      frontLens, sheen, backPlate, rimMesh, neonBevelMesh, neonBevelMat, bevelGlow, milledMesh, centerCore, tube,
      neonOuter, neonInner, halo, particles, pGeo, pPos, PN, LENS_Z, COIN_R
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

  function refreshLang() {
    const heroEl = document.querySelector('#frame-1 .hero-title');
    if (heroEl) splitWords(heroEl, true);
    if (S.run && S.run.story) S.run.story.refreshStats();
  }

  function refreshStats() {
    if (S.run && S.run.story) S.run.story.refreshStats();
  }

  function makeCurtain() {
    let c = $('scrolly-curtain');
    if (!c) { c = document.createElement('div'); c.id = 'scrolly-curtain'; c.className = 'scrolly-curtain'; document.body.appendChild(c); }
    return c;
  }

  // Story mode: one coin, one camera on a Catmull-Rom spline with damped follow
  const catmull = (a, b, c, d, u) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  // keys: [percent of scroll, distance, azimuth deg, elevation deg, FOV deg, target x, target y]
  function makeCameraPath(keys) {
    return p => {
      let i = keys.findIndex(k => k[0] > p);
      if (i < 0) i = keys.length - 1; if (i < 1) i = 1;
      const k0 = keys[Math.max(0, i - 2)], k1 = keys[i - 1], k2 = keys[i], k3 = keys[Math.min(keys.length - 1, i + 1)];
      const u = clamp((p - k1[0]) / Math.max(1e-6, k2[0] - k1[0]), 0, 1);
      return [1, 2, 3, 4, 5, 6].map(j => catmull(k0[j], k1[j], k2[j], k3[j], u));
    };
  }

  function paintSpriteCanvas(c, lines, { w = 256, h = 64, bg = null } = {}) {
    const x = c.getContext('2d');
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, c.width, c.height);
    x.scale(2, 2);
    if (bg) {
      x.fillStyle = bg.fill; x.strokeStyle = bg.stroke; x.lineWidth = 2; x.beginPath(); x.moveTo(14, 1);
      x.arcTo(w - 1, 1, w - 1, h - 1, 14); x.arcTo(w - 1, h - 1, 1, h - 1, 14); x.arcTo(1, h - 1, 1, 1, 14); x.arcTo(1, 1, w - 1, 1, 14);
      x.closePath(); x.fill(); x.stroke();
    }
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => {
      x.fillStyle = l.color;
      x.font = `700 ${l.size}px 'Noto Sans Thai', Inter, system-ui, sans-serif`;
      x.fillText(l.t, w / 2, h * (i + 1) / (lines.length + 1) + 1);
    });
    x.restore();
  }

  function textSprite(lines, opts = {}) {
    const w = opts.w || 256, h = opts.h || 64, ppu = opts.ppu || 120;
    const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
    paintSpriteCanvas(c, lines, opts);
    const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
    sp.scale.set(w / ppu, h / ppu, 1); sp.renderOrder = 10;
    sp.userData = { canvas: c, opts };
    return sp;
  }

  function updateTextSprite(sp, lines) {
    const { canvas, opts } = sp.userData || {};
    if (!canvas || !sp.material || !sp.material.map) return;
    paintSpriteCanvas(canvas, lines, opts);
    sp.material.map.needsUpdate = true;
  }

  // Read live portfolio metrics when logged in with trades, otherwise sample fallback values
  function getStoryMetrics() {
    const trades = typeof getActiveTrades === 'function' ? getActiveTrades() : [];
    const portList = typeof portfolios !== 'undefined' && Array.isArray(portfolios) ? portfolios : [];
    const fallbackTags = ['MAIN', 'PROP FIRM', 'DEMO'];
    const tags = [0, 1, 2].map(i => (portList[i] && portList[i].name ? String(portList[i].name).toUpperCase().slice(0, 14) : fallbackTags[i]));

    if (!trades.length || typeof pnl !== 'function') {
      return { winRate: '54.3%', profitFactor: '1.45', maxDD: '3,118', tags };
    }
    const wins = trades.filter(t => pnl(t) > 0), losses = trades.filter(t => pnl(t) <= 0);
    const wr = `${(wins.length / trades.length * 100).toFixed(1)}%`;
    const grossW = wins.reduce((s, t) => s + pnl(t), 0);
    const grossL = Math.abs(losses.reduce((s, t) => s + pnl(t), 0));
    const pf = grossL ? (grossW / grossL).toFixed(2) : (wins.length ? 'INF' : '0.00');
    const sorted = [...trades].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let runBal = 0, peak = 0, maxDD = 0;
    sorted.forEach(t => { runBal += pnl(t); if (runBal > peak) peak = runBal; const dd = peak - runBal; if (dd > maxDD) maxDD = dd; });
    return { winRate: wr, profitFactor: pf, maxDD: Math.round(maxDD).toLocaleString('en-US'), tags };
  }

  function buildStoryActors(sc) {
    const OR = 0xff6a2b, GR = 0x2fbf71, RD = 0xef5350, GY = 0x8a8e96, PANEL = 0x141517, EDGE = 0x3a3d44;
    const V = p => new THREE.Vector3(...p);
    const C = hex => new THREE.Color(hex).convertSRGBToLinear();   // unlit materials skip the sRGB to linear step in r128
    const lineMat = (hex, op = 0) => new THREE.LineBasicMaterial({ color: C(hex), transparent: true, opacity: op, depthWrite: false });
    const dashMat = hex => new THREE.LineDashedMaterial({ color: C(hex), transparent: true, opacity: 0.95, dashSize: 0.1, gapSize: 0.07 });
    const flat = (hex, op = 0) => new THREE.MeshBasicMaterial({ color: C(hex), transparent: true, opacity: op, depthWrite: false, toneMapped: false });
    const line = (pts, mat, loop) => new (loop ? THREE.LineLoop : THREE.Line)(new THREE.BufferGeometry().setFromPoints(pts.map(V)), mat);
    const dashed = (x2, hex) => { const l = line([[0, 0, 0], [x2, 0, 0]], dashMat(hex)); l.computeLineDistances(); return l; };
    const lvl = (y, hex) => { const g = new THREE.Group(); g.position.set(1.9, y, -0.05); g.scale.x = 0.0001; g.add(dashed(3.4, hex)); return g; };
    const tag = (t, color, x, y) => { const sp = textSprite([{ t, color, size: 34 }]); sp.scale.multiplyScalar(0.75); sp.position.set(x, y, 0); return sp; };
    const bracket = (x, y1, y2) => line([[x - 0.1, y1, 0], [x, y1, 0], [x, y2, 0], [x - 0.1, y2, 0]], lineMat(OR));
    const card = (w, h, op = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flat(PANEL, op));
      m.add(line([[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0]], lineMat(EDGE), true)); m.scale.set(w, h, 1); return m;
    };

    // grid: lies flat as a floor in scene 1, stands up into the chart in scene 2
    const pts = [], N = 22;
    for (let i = -N; i <= N; i++) pts.push(i, -N, 0, i, N, 0, -N, i, 0, N, i, 0);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const plane = new THREE.Group();
    plane.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: C(EDGE), transparent: true, opacity: 0.5, depthWrite: false })));
    plane.rotation.x = -Math.PI / 2; plane.position.set(0, -1.3, 0);

    // notes: everything drawn around the first trade; folds back into the coin in scene 5
    const notes = new THREE.Group();
    const green = new THREE.MeshBasicMaterial({ color: C(0x1fa863), transparent: true });
    const candle = new THREE.Group(); candle.position.set(1.7, 0.5, -0.05); candle.scale.y = 0.0001;
    candle.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), green), new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.9, 0.035), green));
    const connector = dashed(0.6, OR); connector.position.set(0.95, 0.5, 0); connector.material.opacity = 0;
    const levels = [lvl(1.55, GR), lvl(0.5, GY), lvl(-0.45, RD)], exitLvl = lvl(2.21, GR);
    const tags = [tag('TP', '#2fbf71', 5.75, 1.55), tag('ENTRY', '#aeb1b7', 5.8, 0.5), tag('SL', '#ef5350', 5.75, -0.45), tag('EXIT', '#2fbf71', 5.8, 2.21)];
    const br1 = bracket(6.35, 0.5, -0.45), br2 = bracket(6.35, 0.5, 2.21);
    const brTags = [tag('1R', '#ff6a2b', 6.95, 0.02), tag('+1.8R', '#2fbf71', 7.05, 1.36)];
    notes.add(candle, connector, ...levels, exitLvl, ...tags, br1, br2, ...brTags);

    // chart: equity curve, glass frame and three stat chips
    const m = getStoryMetrics();
    const chart = new THREE.Group(); chart.position.set(0, 0.5, 0);
    const kx = [-4.5, -3.5, -2.5, -1.5, -0.7, 0, 0.9, 1.9, 3, 4.2], ky = [-1.2, -0.7, -0.95, -0.3, -0.45, 0.5, 0.7, 0.45, 1.1, 1.5];
    const knots = kx.map((x, i) => new THREE.Vector3(x, ky[i] - 0.5, 0));
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(knots), 200, 0.03, 6, false);
    const curve = new THREE.Mesh(tube, flat(GR, 1)); curve.geometry.setDrawRange(0, 0);
    const dots = knots.map(k => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), flat(GR, 1)); d.position.copy(k); d.scale.setScalar(0.0001); return d; });
    const frame = new THREE.Group(); frame.scale.setScalar(1.3);
    frame.add(line([[-5, -2.2, 0], [5, -2.2, 0], [5, 2.2, 0], [-5, 2.2, 0]], lineMat(0x5a5e66), true));
    const frameFill = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.4), flat(0xffffff)); frameFill.position.z = -0.05; frame.add(frameFill);
    const chipDefs = [['WIN RATE', 'winRate', -3.3], ['PROFIT FACTOR', 'profitFactor', 0], ['MAX DRAWDOWN', 'maxDD', 3.3]];
    const chips = chipDefs.map(([label, key, x]) => {
      const sp = textSprite([{ t: label, color: '#8a8e96', size: 20 }, { t: m[key], color: '#ffffff', size: 34 }], { w: 256, h: 96, ppu: 100, bg: { fill: '#141517', stroke: '#3a3d44' } });
      sp.position.set(x, -2.75, 0); return sp;
    });
    chart.add(curve, ...dots, frame, ...chips);

    // cards: scene 7 stacks them, scene 8 slides them into the dashboard grid
    const cards = [card(4.4, 2.6), card(4.4, 2.6), card(4.4, 2.6)];
    cards[0].position.set(0, 0.5, -0.04); cards[1].position.set(0, 0.5, -0.3); cards[2].position.set(0, 0.5, -0.55);
    const cardTags = [
      tag(m.tags[0], '#e8e9eb', -1.35, 1.55),
      tag(m.tags[1], '#8a8e96', -1.0, 1.9),
      tag(m.tags[2], '#8a8e96', -0.6, 2.2),
    ];
    const stats = [-3.9, -1.3, 1.3, 3.9].map(x => { const c = card(2.35, 0.8); c.position.set(x, 2.65, -0.06); c.scale.set(0.0001, 0.0001, 1); return c; });

    sc.scene.add(plane, notes, chart, ...cards, ...cardTags, ...stats);
    const draw = { v: 0, apply() { const n = tube.index.count; curve.geometry.setDrawRange(0, Math.floor(n * draw.v / 6) * 6); } };
    const refreshStats = () => {
      const cur = getStoryMetrics();
      chipDefs.forEach(([label, key], i) => updateTextSprite(chips[i], [{ t: label, color: '#8a8e96', size: 20 }, { t: cur[key], color: '#ffffff', size: 34 }]));
      cardTags.forEach((sp, i) => updateTextSprite(sp, [{ t: cur.tags[i], color: i === 0 ? '#e8e9eb' : '#8a8e96', size: 34 }]));
    };
    return { plane, notes, candle, connector, levels, exitLvl, tags, br1, br2, brTags, chart, curve, dots, frame, frameFill, chips, cards, cardTags, stats, draw, refreshStats };
  }

  function buildStory(run, sc, tl, baseZ) {
    run.container.style.height = '800vh';
    const nav = $('scrolly-chapters'); if (nav) nav.style.display = 'none';
    gsap.set(['#frame-3', '#frame-5', '#frame-7', '#frame-11', '#frame-13', '#frame-15', '#frame-16'], { autoAlpha: 0 });

    const A = buildStoryActors(sc), camP = { v: 0 };
    const path = makeCameraPath([
      [0, 9.0, -30, 35, 60, 0, 0.5], [7, 7.4, -20, 30, 60, 0, 0.5],             // 01 open: 3/4 high, dolly in, orbit +10
      [8, 7.4, -20, 30, 60, 0, 0.5], [17, 6.6, -20, 8, 50, 0, 0.5],             // 02 record: drops to 8 degrees as floor stands up
      [18, 6.6, -20, 8, 50, 0, 0.5], [27, 15, -15, 3, 28, 0, 0.5],              // 03 risk: dolly out, narrow lens
      [28, 15, -15, 3, 28, 0, 0.5], [37, 14.5, -12, 3, 28, 1.8, 0.5],           // 04 measure: truck right to read R brackets
      [38, 14.5, -12, 3, 28, 1.8, 0.5], [48, 10, -25, 22, 46, 0, 0.5],          // 05 curve: crane up and back
      [49, 10, -25, 22, 46, 0, 0.5], [59, 10.6, -8, 6, 42, 0, -0.55],           // 06 statistics: front-on, lift frame and chips above caption
      [60, 10.6, -8, 6, 42, 0, -0.55], [70, 10.6, 26, 14, 48, -1.65, 0.35],      // 07 portfolios: shift target left on landscape so stack sits right
      [71, 10.6, 26, 14, 48, -1.65, 0.35], [85, 11.4, 0, 0, 42, 0, -0.35],      // 08 dashboard: pull back and lift grid clear of caption
      [88, 9, 0, 0, 40, 0, 0.5], [100, 9, 0, 0, 40, 0, 0.5],                    // 09 dock: locked head-on
    ]);
    const st = { d: 9, az: -30, el: 35, fov: 60, tx: 0, ty: 0.5 }, target = new THREE.Vector3(0, 0.5, 0), rad = THREE.MathUtils.degToRad;
    run.story = {
      refreshStats: A.refreshStats,
      apply(camera, dt) {
        const [d, az, el, fov, txRaw, ty] = path(camP.v), k = 1 - Math.exp(-dt * 10), asp = sc.renderer.domElement.clientWidth / Math.max(1, sc.renderer.domElement.clientHeight);
        const f = baseZ() / 7, tx = txRaw < 0 ? txRaw * clamp((asp - 0.45) / 0.75, 0.18, 1) : txRaw;
        st.d += (d * f - st.d) * k; st.az += (az - st.az) * k; st.el += (el - st.el) * k;
        st.fov += (fov - st.fov) * k; st.tx += (tx - st.tx) * k; st.ty += (ty - st.ty) * k;
        target.set(st.tx, st.ty, 0);
        camera.position.set(target.x + st.d * Math.sin(rad(st.az)) * Math.cos(rad(st.el)), target.y + st.d * Math.sin(rad(st.el)), target.z + st.d * Math.cos(rad(st.az)) * Math.cos(rad(st.el)));
        camera.lookAt(target);
        if (Math.abs(camera.fov - st.fov) > 1e-3) { camera.fov = st.fov; camera.updateProjectionMatrix(); }
      },
    };
    const canvasEl = () => sc.renderer.domElement;
    // Where the coin lands so it aligns with the real nav logo from the final head-on camera
    const storyDock = () => {
      const els = ['.app-nav-rail .nav-logo.logo-mark', '.nav-logo', '.logo-block .logo-mark', '.logo-mark'].map(q => document.querySelector(q));
      const el = els.find(e => e && e.getBoundingClientRect().width > 0);
      if (!el) return { x: -3.2, y: 2.6, s: 0.2 };
      const r = el.getBoundingClientRect(), W = canvasEl().clientWidth, H = canvasEl().clientHeight;
      const halfH = 9 * (baseZ() / 7) * Math.tan(rad(40 / 2)), halfW = halfH * (W / H);
      const nx = ((r.left + r.width / 2) / W) * 2 - 1, ny = -(((r.top + r.height / 2) / H) * 2 - 1);
      return { x: nx * halfW, y: 0.5 + ny * halfH, s: (Math.max(r.width, r.height) * (2 * halfH / H)) / (sc.COIN_R * 2) };
    };

    // Place story captions inside .scrolly-sections (above #webgl-canvas z-index 50)
    const capHost = run.container.querySelector('.scrolly-sections') || run.container;
    const cap = (tKey, dKey, { right = false, bottom = right ? '5vh' : '12vh', maxW = 440 } = {}) => {
      const el = document.createElement('div');
      el.style.cssText = `position:fixed;bottom:${bottom};${right ? 'right:6vw;text-align:right;' : 'left:6vw;'}max-width:min(${maxW}px,86vw);color:#fff;pointer-events:none;z-index:60;opacity:0;visibility:hidden;text-shadow:0 2px 14px rgba(0,0,0,0.9)`;
      const h = document.createElement('div'); h.setAttribute('data-i18n', tKey); h.style.cssText = 'font-size:clamp(24px,3.6vw,44px);font-weight:800;line-height:1.1'; h.textContent = tr(tKey);
      const p = document.createElement('div'); p.setAttribute('data-i18n', dKey); p.style.cssText = 'margin-top:10px;font-size:clamp(13px,1.25vw,16px);line-height:1.5;color:#c2c6ce'; p.textContent = tr(dKey);
      el.append(h, p); capHost.appendChild(el); return el;
    };
    const show = (el, at, out) => {
      tl.fromTo(el, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 2.5, ease: 'power2.out' }, at);
      tl.to(el, { autoAlpha: 0, y: -16, duration: 2.5, ease: 'power2.in' }, out);
    };
    const op = (o, at, v = 1, dur = 2.5) => tl.to((o.material || o), { opacity: v, duration: dur, ease: 'power2.out' }, at);
    const grow = (o, at, dur = 4) => tl.to(o.scale, { x: 1, duration: dur, ease: 'power3.out' }, at);
    const zero = { x: 0.0001, y: 0.0001, z: 0.0001 };

    tl.to(camP, { v: 100, duration: 100, ease: 'none' }, 0);
    tl.to('#frame-1', { autoAlpha: 0, y: -40, duration: 3 }, 5);

    // 02 record (8 to 18)
    tl.to(A.plane.rotation, { x: 0, duration: 10, ease: 'power2.inOut' }, 8);
    tl.to(A.plane.position, { y: 0.5, z: -0.9, duration: 10, ease: 'power2.inOut' }, 8);
    op(A.connector, 10, 0.9, 2); tl.to(A.candle.scale, { y: 1, duration: 4, ease: 'power3.out' }, 11);
    show(cap('intro.ch1Title', 'intro.ch1Desc'), 9, 17);

    // 03 risk (18 to 28)
    A.levels.forEach((g, i) => grow(g, 20 + i * 1.2)); [0, 1, 2].forEach(i => op(A.tags[i], 23 + i * 0.8));
    show(cap('intro.ch2Title', 'intro.ch2Desc'), 19, 27);

    // 04 measure (28 to 38)
    op(A.levels[0].children[0].material, 29, 0.25); op(A.tags[0], 29, 0.25);
    grow(A.exitLvl, 29.5); op(A.tags[3], 32); op(A.br1, 31, 1); op(A.brTags[0], 32.5); op(A.br2, 33.5, 1); op(A.brTags[1], 35);
    show(cap('intro.ch3Title', 'intro.ch3Desc', { right: true, bottom: '6vh' }), 29, 37);

    // 05 curve (38 to 49)
    tl.to(A.notes.scale, { ...zero, duration: 3, ease: 'power3.in' }, 38.5);
    tl.to(A.plane.children[0].material, { opacity: 0.22, duration: 6 }, 40);
    tl.to(A.draw, { v: 0.556, duration: 8, ease: 'none', onUpdate: A.draw.apply }, 40);
    A.dots.slice(0, 6).forEach((d, i) => tl.to(d.scale, { x: 1, y: 1, z: 1, duration: 1, ease: 'back.out(3)' }, 40 + i * 1.5));

    // 06 statistics (49 to 60)
    tl.to(A.draw, { v: 1, duration: 5, ease: 'none', onUpdate: A.draw.apply }, 50);
    A.dots.slice(6).forEach((d, i) => tl.to(d.scale, { x: 1, y: 1, z: 1, duration: 1, ease: 'back.out(3)' }, 50 + i * 1.2));
    tl.to(A.frame.scale, { x: 1, y: 1, z: 1, duration: 5, ease: 'power3.out' }, 52);
    op(A.frame.children[0].material, 52, 1, 4); op(A.frameFill.material, 52, 0.035, 4);
    A.chips.forEach((c, i) => op(c, 56 + i * 1.2));
    show(cap('intro.ch4Title', 'intro.ch4Desc', { bottom: '5vh', maxW: 400 }), 50, 59);

    // 07 portfolios (60 to 71): cards shifted right via camera tx, caption stays clear on bottom-left
    A.chips.forEach(c => op(c, 60, 0, 1.5));
    tl.to(A.chart.scale, { x: 0.42, y: 0.42, z: 0.42, duration: 7, ease: 'power3.inOut' }, 61);
    A.cards.forEach((c, i) => { op(c, 62 + i * 0.6, 1, 3); op(c.children[0], 62 + i * 0.6, 1, 3); });
    tl.to(A.cards[1].position, { x: 0.5, y: 0.8, duration: 5, ease: 'power3.out' }, 63.5);
    tl.to(A.cards[2].position, { x: 1.0, y: 1.1, duration: 5, ease: 'power3.out' }, 64.2);
    A.cardTags.forEach((t, i) => op(t, 67 + i * 0.5));
    show(cap('intro.ch5Title', 'intro.ch5Desc', { bottom: '8vh', maxW: 360 }), 61, 70);

    // 08 dashboard (71 to 86): grid pulled high via camera distance and ty, caption stays clear below
    A.cardTags.forEach(t => op(t, 71.5, 0, 1.5));
    tl.to(A.chart.scale, { x: 0.92, y: 0.55, z: 1, duration: 9, ease: 'power3.inOut' }, 72);
    tl.to(A.cards[0].scale, { x: 10, y: 2.8, duration: 9, ease: 'power3.inOut' }, 72);
    tl.to(A.cards[1].position, { x: -2.55, y: -1.85, duration: 9, ease: 'power3.inOut' }, 72);
    tl.to(A.cards[1].scale, { x: 4.9, y: 1.4, duration: 9, ease: 'power3.inOut' }, 72);
    tl.to(A.cards[2].position, { x: 2.55, y: -1.85, duration: 9, ease: 'power3.inOut' }, 72);
    tl.to(A.cards[2].scale, { x: 4.9, y: 1.4, duration: 9, ease: 'power3.inOut' }, 72);
    A.stats.forEach((c, i) => { tl.to(c.scale, { x: 2.35, y: 0.8, duration: 3.5, ease: 'power3.out' }, 73 + i * 0.9); op(c, 73 + i * 0.9, 1, 2.5); op(c.children[0], 73 + i * 0.9, 1, 2.5); });
    show(cap('intro.ch6Title', 'intro.ch6Desc', { bottom: '4.5vh', maxW: 480 }), 72, 81);

    // 09 dock (86 to 100): fade neon bloom/glow and dock onto real UI logo
    tl.to(sc.rig.position, { x: () => storyDock().x, y: () => storyDock().y, z: 0, duration: 10, ease: 'power3.inOut' }, 88);
    tl.to(sc.rig.scale, { x: () => storyDock().s, y: () => storyDock().s, z: () => storyDock().s, duration: 10, ease: 'power3.inOut' }, 88);
    [...A.cards, ...A.stats].forEach(c => { op(c, 88, 0, 5); op(c.children[0], 88, 0, 5); });
    [A.curve, A.frameFill].forEach(m => op(m, 88, 0, 5)); op(A.frame.children[0].material, 88, 0, 5);
    A.dots.forEach(d => op(d, 88, 0, 5));
    tl.to(A.plane.children[0].material, { opacity: 0, duration: 5 }, 88);
    tl.to(run.PK, { v: 0, duration: 7 }, 88);
    op(sc.halo, 88, 0, 6); op(sc.particles, 88, 0, 6);
    op(sc.bevelGlow, 88, 0, 6); op(sc.sheen, 88, 0, 6); op(sc.milledMesh, 88, 0, 6);
    [sc.neonOuter.mats[1], sc.neonOuter.mats[2], sc.neonOuter.hot,
     sc.neonInner.mats[1], sc.neonInner.mats[2], sc.neonInner.hot].forEach(m => tl.to(m, { opacity: 0, duration: 6 }, 88));
    ['lSunset', 'lVerm', 'lCyan'].forEach(k => { if (sc.lights[k]) tl.to(sc.lights[k], { intensity: 0.45, duration: 8 }, 88); });
    tl.fromTo('#frame-16', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 2.5, ease: 'power2.out' }, 96.5);
    tl.to('.nav-logo', { opacity: 1, duration: 2.5 }, 96.5);
    tl.to(run.canvas, { opacity: 0, duration: 2.5 }, 97);
  }

  // Timeline and render loop
  const QUALITY_DPR = [2, 1.5, 1, 0.75];   // adaptive ladder, index = level

  function start() {
    const container = $('scrolly-container'), canvas = $('webgl-canvas');
    const isSmall = window.matchMedia && window.matchMedia('(max-width: 700px)').matches;
    const forced = qs.get('q');
    let level = forced !== null ? clamp(parseInt(forced, 10) || 0, 0, 3) : (isSmall || (navigator.hardwareConcurrency || 8) <= 4 ? 1 : 0);

    if (qs.get('debug')) window.__TT = S;
    const run = S.run = {
      container, canvas, raf: 0, last: performance.now(), t: 0, renderOn: true,
      listeners: [], mouse: { x: 0, y: 0, tx: 0, ty: 0 }, ema: 1 / 60, frames: 0,
      q: { level, locked: forced !== null },
    };
    const sc = run.sc = buildScene(canvas, QUALITY_DPR[level]), { renderer, scene, camera } = sc;
    const aspect = () => canvas.clientWidth / canvas.clientHeight;
    const baseZ = () => Math.max(7.0, 6.4 / aspect());

    run.PK = { v: 1.0 };      // mouse parallax strength
    run.P = { speed: 0.9 };   // particle speed

    sc.rig.position.set(0, 0.5, 0);
    const heroWords = splitWords(document.querySelector('#frame-1 .hero-title'));

    const tl = run.tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: container, start: 'top top', end: 'bottom bottom', scrub: 0.8, invalidateOnRefresh: true,
        onUpdate: self => {
          const bar = $('scrolly-progress'); if (bar) bar.style.transform = `scaleX(${self.progress})`;
        },
        onToggle: self => { run.renderOn = self.isActive; },
        onLeave: () => finish({ seen: true }),
      },
    });
    run.st = tl.scrollTrigger;

    buildStory(run, sc, tl, baseZ);

    if (window.Lenis) {
      run.lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      run.lenis.on('scroll', ScrollTrigger.update);
    }

    // Boot entrance: coin spins in, hero words rise
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

  function applyQuality(run) {
    const { renderer, camera } = run.sc, c = run.canvas;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_DPR[run.q.level]));
    renderer.setSize(c.clientWidth, c.clientHeight, false);
    camera.aspect = c.clientWidth / c.clientHeight; camera.updateProjectionMatrix();
  }

  function frame(now) {
    const run = S.run; if (!run) return;
    run.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    if (run.lenis) run.lenis.raf(now);
    if (!run.renderOn) return;

    run.t += dt;
    const sc = run.sc, { scene, camera, renderer, parallax, pPos, PN } = sc;

    run.ema += (dt - run.ema) * 0.08; run.frames++;
    if (!run.q.locked && run.frames > 50 && run.ema > 1 / 27 && run.q.level < QUALITY_DPR.length - 1) {
      run.q.level++; applyQuality(run); run.frames = 0; run.ema = 1 / 60;
    }

    run.story.apply(camera, dt);

    run.mouse.x += (run.mouse.tx - run.mouse.x) * 0.08;
    run.mouse.y += (run.mouse.ty - run.mouse.y) * 0.08;
    const pk = run.PK.v;
    parallax.position.x = run.mouse.x * 0.22 * pk;
    parallax.position.y = -run.mouse.y * 0.16 * pk + Math.sin(run.t * 0.9) * 0.05 * pk;
    parallax.rotation.y = run.mouse.x * 0.18 * pk;
    parallax.rotation.x = -run.mouse.y * 0.12 * pk;

    const pSpeed = run.P.speed;
    for (let i = 0; i < PN; i++) { let z = pPos[i * 3 + 2] + dt * pSpeed; if (z > 9) z = -16; pPos[i * 3 + 2] = z; }
    sc.pGeo.attributes.position.needsUpdate = true;

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
    const navLogo = document.querySelector('.nav-logo'); if (navLogo) navLogo.style.opacity = '';
    container && container.remove();
    document.body.style.overflow = '';
    window.scrollTo(0, carry);
  }

  // Skip: cover with a curtain, swap, reveal. No hard cut from 3D to the dashboard
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

  // Prepare / boot (idempotent: auth events call this repeatedly)
  async function prepare() {
    if (S.phase !== 'idle') return;
    if (!shouldPlay()) { S.phase = 'done'; const c = $('scrolly-container'); c && c.remove(); return; }
    S.phase = 'loading';
    document.documentElement.classList.add('intro-active', 'intro-loading');
    try {
      await loadLibs(makeLoader(5));
      if (S.phase !== 'loading') return;      // skipped or torn down while loading
      start();
      S.phase = 'playing';
    } catch (err) {
      console.warn('Scrolly3D fallback:', err);
      S.phase = 'idle'; finish({ seen: false });
    }
  }

  window.ScrollyIntro = { prepare, skip, refreshLang, refreshStats, teardown: () => { if (S.phase === 'loading' || S.phase === 'playing') finish({ seen: false }); } };
})();
