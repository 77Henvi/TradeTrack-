/* ════════════════════════════════════════════════════════════════════════════
   TrackTrade — 16-Scene Master 3D Scrollytelling Intro
   Continuous 60-120 FPS WebGL Engine • Arounda Luxury Sunset Palette
   Precision 3D Glass Coin • Candlestick Core • Crystal Monolith • Topographic Ocean
   HUD Reticles • Warp Tunnel • Exploded Layers • Multi-Account • Docking
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SEEN_KEY = 'tt_intro_seen_v2';
  const LIBS = {
    three:  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    gsap:   'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
    st:     'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
    lenis:  'https://unpkg.com/lenis@1.1.18/dist/lenis.min.js',
  };

  // Arounda Luxury Sunset Palette
  const COL = {
    sunset:     0xff6129, // Warm Sunset Orange (#FF6129)
    vermillion: 0xfc3b00, // Electric Vermillion (#FC3B00)
    peach:      0xff7145, // Soft Peach (#FF7145)
    cyan:       0x38bdf8, // Electric Cyan (#38BDF8)
    green:      0x22c55e, // Emerald Green (#22C55E)
    gold:       0xffb347, // Golden Amber (#FFB347)
    titanium:   0x221e1c, // Dark Brushed Titanium
    white:      0xffffff,
    dark:       0x080605,
  };

  const $ = id => document.getElementById(id);
  const S = { phase: 'idle', finishing: false, run: null, prevRestoration: null };

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
    if (new URLSearchParams(location.search).get('intro') === '1') return true;
    try { return localStorage.getItem(SEEN_KEY) !== '1'; } catch (_) { return true; }
  }

  function loadScript(src, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const t = setTimeout(() => { s.remove(); reject(new Error('timeout: ' + src)); }, timeout);
      s.src = src; s.async = true;
      s.onload  = () => { clearTimeout(t); resolve(); };
      s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('failed: ' + src)); };
      document.head.appendChild(s);
    });
  }

  function loadLibs() {
    const need = (g, url) => (window[g] ? Promise.resolve() : loadScript(url));
    return Promise.all([
      need('THREE', LIBS.three),
      need('gsap', LIBS.gsap).then(() => need('ScrollTrigger', LIBS.st)),
      need('Lenis', LIBS.lenis),
    ]);
  }

  // ─── PROCEDURAL CANVAS TEXTURES (GLOW, LABELS, HUD, BLUEPRINT, DASHBOARD) ───
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };

  function glowSpriteTexture(inner, outer) {
    const c = mkCanvas(256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, inner); gr.addColorStop(0.38, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  function labelTexture(text, color, bg = 'rgba(13,10,8,0.78)', borderColor = '#FF6129') {
    const c = mkCanvas(320, 110), g = c.getContext('2d');
    g.fillStyle = bg;
    g.roundRect ? g.roundRect(8, 8, 304, 94, 20) : g.rect(8, 8, 304, 94);
    g.fill();
    g.strokeStyle = borderColor; g.lineWidth = 4;
    g.stroke();
    g.font = '800 48px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 14; g.fillStyle = color; g.fillText(text, 160, 56);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  function circularBadgeTexture(text, sub, color, borderColor = '#FF6129') {
    const c = mkCanvas(256), g = c.getContext('2d');
    g.beginPath(); g.arc(128, 128, 116, 0, Math.PI * 2);
    g.fillStyle = 'rgba(8,6,5,0.85)'; g.fill();
    g.strokeStyle = borderColor; g.lineWidth = 6; g.stroke();
    g.font = '800 46px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 12; g.fillStyle = color;
    g.fillText(text, 128, 105);
    g.font = '700 24px Inter, sans-serif'; g.fillStyle = '#a39791'; g.shadowBlur = 0;
    g.fillText(sub, 128, 155);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // Scene 14: Blueprint Circuit Board Motherboard Floor Texture
  function createBlueprintTexture() {
    const c = mkCanvas(1024, 1024), g = c.getContext('2d');
    g.fillStyle = '#05070d'; g.fillRect(0, 0, 1024, 1024);
    // Background Fine Blueprint Grid
    g.strokeStyle = 'rgba(56, 189, 248, 0.08)'; g.lineWidth = 1;
    for (let x = 0; x <= 1024; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 1024); g.stroke(); }
    for (let y = 0; y <= 1024; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(1024, y); g.stroke(); }
    // Primary PCB Bus Tracks (Glowing Sunset Orange)
    g.strokeStyle = 'rgba(255, 97, 41, 0.78)'; g.lineWidth = 3; g.shadowColor = '#FF6129'; g.shadowBlur = 10;
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
      p.forEach(pt => {
        g.beginPath(); g.arc(pt[0], pt[1], 4, 0, Math.PI * 2);
        g.fillStyle = '#FC3B00'; g.fill();
      });
    });
    // Cyan Microchip Architecture Lines
    g.strokeStyle = '#38BDF8'; g.lineWidth = 2; g.shadowColor = '#38BDF8'; g.shadowBlur = 8;
    g.strokeRect(460, 460, 104, 104);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // Scene 15: Holographic 3D Dashboard Tablet Surface Texture
  function createDashboardTexture() {
    const c = mkCanvas(1024, 640), g = c.getContext('2d');
    g.fillStyle = '#080605'; g.fillRect(0, 0, 1024, 640);
    // Outer Border & Glass Bevel
    g.strokeStyle = 'rgba(255, 97, 41, 0.45)'; g.lineWidth = 3; g.strokeRect(6, 6, 1012, 628);
    // Top Bar
    g.fillStyle = 'rgba(255, 97, 41, 0.10)'; g.fillRect(6, 6, 1012, 64);
    g.fillStyle = '#FF6129'; g.font = 'bold 22px Inter, sans-serif';
    g.fillText('▲  TRACKTRADE DASHBOARD', 36, 42);
    g.font = '600 14px Inter, sans-serif'; g.fillStyle = '#a39791';
    g.fillText('PRO LEVEL • MULTI-PORTFOLIO ACTIVE', 700, 42);
    // 4 KPI Stat Cards
    const kpis = [
      { title: 'NET P&L', val: '+$48,150.00', col: '#22c55e' },
      { title: 'WIN RATE', val: '71.4%', col: '#FF6129' },
      { title: 'PROFIT FACTOR', val: '2.41', col: '#38bdf8' },
      { title: 'AVG R:R', val: '1:2.85', col: '#ffb347' },
    ];
    kpis.forEach((k, i) => {
      const x = 36 + i * 240;
      g.fillStyle = 'rgba(255,255,255,0.04)'; g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1;
      g.roundRect ? g.roundRect(x, 90, 220, 80, 8) : g.rect(x, 90, 220, 80);
      g.fill(); g.stroke();
      g.fillStyle = '#a39791'; g.font = '700 11px Inter, sans-serif'; g.fillText(k.title, x + 16, 115);
      g.fillStyle = k.col; g.font = 'bold 22px Inter, sans-serif'; g.fillText(k.val, x + 16, 148);
    });
    // Main Chart Box
    g.fillStyle = 'rgba(255,255,255,0.02)'; g.strokeStyle = 'rgba(255, 97, 41, 0.25)';
    g.strokeRect(36, 190, 952, 410);
    // Glowing Orange 3D Candlesticks on Screen
    for (let i = 0; i < 28; i++) {
      const cx = 60 + i * 33;
      const cy = 380 - Math.sin(i * 0.28) * 85 - (i * 3.2);
      const ch = 14 + ((i * 17) % 42);
      const isUp = i % 3 !== 0;
      g.strokeStyle = isUp ? '#FF6129' : '#FF7145'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy - ch - 12); g.lineTo(cx, cy + ch + 12); g.stroke();
      g.fillStyle = isUp ? '#FF6129' : '#FC3B00';
      g.fillRect(cx - 7, cy - ch, 14, ch * 2);
    }
    // High-Expectancy Emerald Equity Curve
    g.strokeStyle = '#22c55e'; g.lineWidth = 4; g.shadowColor = '#22c55e'; g.shadowBlur = 12;
    g.beginPath(); g.moveTo(40, 520);
    for (let x = 40; x <= 980; x += 20) {
      const prog = (x - 40) / 940;
      const y = 520 - prog * 280 + Math.sin(prog * 12) * 22;
      g.lineTo(x, y);
    }
    g.stroke();
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // Equilateral triangle shape centered at centroid
  function createTriangleShape(s = 2.0) {
    const h = (s * Math.sqrt(3)) / 2;
    const yTop = (2 / 3) * h, yBot = -(1 / 3) * h, xHalf = s / 2;
    const shape = new THREE.Shape();
    shape.moveTo(0, yTop); shape.lineTo(xHalf, yBot); shape.lineTo(-xHalf, yBot); shape.closePath();
    return shape;
  }

  function createDoubleTriangleGroup(s = 1.35) {
    const g = new THREE.Group();
    const neonMat = new THREE.LineBasicMaterial({ color: COL.sunset, linewidth: 3, toneMapped: false });
    const neonInnerMat = new THREE.LineBasicMaterial({ color: COL.vermillion, linewidth: 2, toneMapped: false });

    const outerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, (2/3) * (s * Math.sqrt(3)/2), 0),
      new THREE.Vector3(s/2, -(1/3) * (s * Math.sqrt(3)/2), 0),
      new THREE.Vector3(-s/2, -(1/3) * (s * Math.sqrt(3)/2), 0),
      new THREE.Vector3(0, (2/3) * (s * Math.sqrt(3)/2), 0)
    ]);
    g.add(new THREE.Line(outerGeo, neonMat));

    const sIn = s * 0.72;
    const innerGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, (2/3) * (sIn * Math.sqrt(3)/2), 0),
      new THREE.Vector3(sIn/2, -(1/3) * (sIn * Math.sqrt(3)/2), 0),
      new THREE.Vector3(-sIn/2, -(1/3) * (sIn * Math.sqrt(3)/2), 0),
      new THREE.Vector3(0, (2/3) * (sIn * Math.sqrt(3)/2), 0)
    ]);
    g.add(new THREE.Line(innerGeo, neonInnerMat));
    return g;
  }

  // ─── 3D HOLOGRAPHIC CANDLESTICK CORE (Scene 01, 02, 03) ──────────────────────
  function createCandlestickGroup() {
    const g = new THREE.Group();
    const pr = mulberry32(101);
    const candleCount = 14;
    const candleSpan = 1.6;
    const step = candleSpan / (candleCount - 1);

    const bullMat = new THREE.MeshBasicMaterial({ color: COL.sunset, toneMapped: false });
    const bearMat = new THREE.MeshBasicMaterial({ color: COL.peach, toneMapped: false });
    const cyanMat = new THREE.MeshBasicMaterial({ color: COL.cyan, toneMapped: false });
    const wickMat = new THREE.LineBasicMaterial({ color: COL.vermillion, transparent: true, opacity: 0.85 });

    let curY = -0.35;
    for (let i = 0; i < candleCount; i++) {
      const x = -candleSpan / 2 + i * step;
      curY += (pr() - 0.38) * 0.16;
      curY = clamp(curY, -0.55, 0.45);
      const isBull = pr() > 0.35;
      const h = 0.08 + pr() * 0.22;
      const wickTop = curY + h / 2 + 0.04 + pr() * 0.08;
      const wickBot = curY - h / 2 - 0.04 - pr() * 0.08;

      const bodyGeo = new THREE.BoxGeometry(0.055, h, 0.05);
      const mat = (i === candleCount - 2) ? cyanMat : (isBull ? bullMat : bearMat);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.set(x, curY, (pr() - 0.5) * 0.05);
      g.add(body);

      const wickGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, wickBot, 0),
        new THREE.Vector3(x, wickTop, 0)
      ]);
      g.add(new THREE.Line(wickGeo, wickMat));
    }
    return g;
  }

  // Soft studio environment for luxury glass refraction highlights
  function buildEnvironment(renderer) {
    const env = new THREE.Scene(); env.background = new THREE.Color(0x050302);
    const panel = (hex, k, w, h, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(0xffffff, 3.2, 9, 3, [0, 6, 3]);
    panel(COL.sunset, 3.0, 4, 9, [-6, 0, 1]);
    panel(COL.vermillion, 2.5, 4, 9, [6, 0, 1]);
    panel(0xffffff, 1.4, 10, 3, [0, -5, 4]);
    panel(COL.peach, 1.8, 6, 6, [0, 0, 8]);
    const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(env, 0.04); pm.dispose();
    env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE BUILDER
  // ═══════════════════════════════════════════════════════════════════════════
  function buildScene(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    const envRT = buildEnvironment(renderer); scene.environment = envRT.texture;

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.40));
    const lSunset = new THREE.PointLight(COL.sunset, 2.4, 25); lSunset.position.set(4, 3, 5); scene.add(lSunset);
    const lVermillion = new THREE.PointLight(COL.vermillion, 1.9, 25); lVermillion.position.set(-4, -2, 4); scene.add(lVermillion);
    const lCyan = new THREE.PointLight(COL.cyan, 1.2, 20); lCyan.position.set(0, 5, 2); scene.add(lCyan);

    // Hierarchy
    const rig = new THREE.Group(), parallax = new THREE.Group(), coinGroup = new THREE.Group(), coinBody = new THREE.Group();
    scene.add(rig); rig.add(parallax); parallax.add(coinGroup); coinGroup.add(coinBody);

    const COIN_R = 1.55;
    const LENS_Z = 0.09;

    // 1. FRONT GLASS LENS (Scene 01, 02, 03, 11)
    const glassCircleShape = new THREE.Shape();
    glassCircleShape.absarc(0, 0, COIN_R, 0, Math.PI * 2);
    const lensGeo = new THREE.ExtrudeGeometry(glassCircleShape, {
      depth: 0.11, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.035, bevelThickness: 0.035
    });
    lensGeo.center();

    const matGlass = new THREE.MeshPhysicalMaterial({
      color: 0x140a06,
      emissive: COL.sunset,
      emissiveIntensity: 0.16,
      roughness: 0.07,
      metalness: 0.08,
      transmission: 0.90,
      ior: 1.52,
      thickness: 0.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.94,
      reflectivity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const frontLensMesh = new THREE.Mesh(lensGeo, matGlass);
    const frontLens = new THREE.Group();
    frontLens.add(frontLensMesh);
    frontLens.position.z = LENS_Z;

    // 2. BACK METAL PLATE (Scene 11 Exploded View)
    const plateGeo = new THREE.ExtrudeGeometry(glassCircleShape, {
      depth: 0.10, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.025, bevelThickness: 0.025
    });
    plateGeo.center();
    const matTitanium = new THREE.MeshStandardMaterial({
      color: COL.titanium,
      metalness: 0.92,
      roughness: 0.28,
      side: THREE.DoubleSide
    });
    const backPlateMesh = new THREE.Mesh(plateGeo, matTitanium);
    const backPlate = new THREE.Group();
    backPlate.add(backPlateMesh);
    backPlate.position.z = -LENS_Z;

    // 3. OUTER TITANIUM RIM & NEON BEVEL RING & MILLED NOTCHES (Scene 02)
    const rimGeo = new THREE.TorusGeometry(COIN_R + 0.015, 0.055, 16, 72);
    const rimMesh = new THREE.Mesh(rimGeo, matTitanium);

    const neonBevelGeo = new THREE.TorusGeometry(COIN_R, 0.016, 12, 80);
    const neonBevelMesh = new THREE.Mesh(neonBevelGeo, new THREE.MeshBasicMaterial({ color: COL.vermillion, toneMapped: false }));

    // Milled Coin Edge radial notches (Scene 02 micro-markings)
    const milledGeo = new THREE.BufferGeometry();
    const milledPts = [];
    for (let i = 0; i < 72; i++) {
      const ang = (i / 72) * Math.PI * 2;
      const r1 = COIN_R + 0.01, r2 = COIN_R + 0.065;
      milledPts.push(
        Math.cos(ang) * r1, Math.sin(ang) * r1, -0.045,
        Math.cos(ang) * r2, Math.sin(ang) * r2, 0.045
      );
    }
    milledGeo.setAttribute('position', new THREE.Float32BufferAttribute(milledPts, 3));
    const milledMesh = new THREE.LineSegments(milledGeo, new THREE.LineBasicMaterial({
      color: COL.peach, transparent: true, opacity: 0.65
    }));

    // 4. INNER CORE (Holographic Delta + 3D Candlesticks + Equity Spline)
    const centerCore = new THREE.Group();
    const doubleDelta = createDoubleTriangleGroup(1.40);
    const candlesticks = createCandlestickGroup();

    // 3D Equity Spline Tube
    const rng = mulberry32(42), pts = []; let v = -0.32;
    for (let i = 0; i < 40; i++) {
      const x = ((i / 39) - 0.5) * 1.35;
      v = clamp(v + 0.026 + (rng() - 0.41) * 0.075, -0.45, 0.48);
      pts.push(new THREE.Vector3(x, v, (rng() - 0.5) * 0.05));
    }
    const curve = new THREE.CatmullRomCurve3(pts), TUBE_SEG = 160, TUBE_RAD = 6;
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, TUBE_SEG, 0.016, TUBE_RAD, false),
      new THREE.MeshBasicMaterial({ color: COL.green, toneMapped: false })
    );
    const tubeIdxCount = tube.geometry.index.count; tube.geometry.setDrawRange(0, 0);
    centerCore.add(doubleDelta, candlesticks, tube);

    // Assemble Coin Body
    coinBody.add(frontLens, backPlate, rimMesh, neonBevelMesh, milledMesh, centerCore);

    // 5. TRUNCATED CRYSTAL GLASS PYRAMID / MONOLITH (Scene 03)
    const crystalGeo = new THREE.CylinderGeometry(1.2, 1.85, 2.2, 4);
    crystalGeo.rotateY(Math.PI / 4);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x140a06,
      emissive: COL.sunset,
      emissiveIntensity: 0.22,
      roughness: 0.06,
      metalness: 0.05,
      transmission: 0.92,
      ior: 1.54,
      thickness: 0.8,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const crystalPrism = new THREE.Mesh(crystalGeo, crystalMat);
    crystalPrism.scale.setScalar(0.0001);
    coinGroup.add(crystalPrism);

    // 6. SUNSET HALO & RADIAL FLARE (Scene 01, 08)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,97,41,0.65)', 'rgba(252,59,0,0.18)'),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.65
    }));
    halo.scale.set(5.8, 5.8, 1); halo.position.z = -0.65; parallax.add(halo);

    const centerFlare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(255,255,255,1)', 'rgba(255,97,41,0.3)'),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0
    }));
    centerFlare.scale.set(1.0, 1.0, 1); centerFlare.position.z = 0.2; coinBody.add(centerFlare);

    // 7. HUD RISK RINGS & 1.0% RISK CALLOUT (Scene 06)
    const hudGroup = new THREE.Group(); parallax.add(hudGroup);
    const hudRing1 = new THREE.Mesh(
      new THREE.TorusGeometry(2.10, 0.012, 8, 120),
      new THREE.MeshBasicMaterial({ color: COL.sunset, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const hudRing2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.35, 0.008, 8, 120),
      new THREE.MeshBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const riskLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: labelTexture('1.0% RISK', '#FF6129', 'rgba(18,10,7,0.85)', '#FC3B00'),
      transparent: true, opacity: 0, depthWrite: false
    }));
    riskLabel.scale.set(0.95, 0.33, 1); riskLabel.position.set(-2.4, 0.2, 0);
    hudGroup.add(hudRing1, hudRing2, riskLabel);

    // 8. ORBITAL R-MULTIPLE RINGS (+2.5R & +3.8R) (Scene 07)
    const ringsGroup = new THREE.Group(); parallax.add(ringsGroup);
    const ringList = [];
    [
      [2.15, [1.15, 0.25, 0], COL.green, '+2.5R', '#22c55e', 0.58],
      [2.65, [-0.85, -0.45, 0.3], COL.cyan, '+3.8R', '#38bdf8', -0.45]
    ].forEach(([rad, tilt, hex, text, css, spin]) => {
      const holder = new THREE.Group(); holder.rotation.set(tilt[0], tilt[1], tilt[2]);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(rad, 0.014, 10, 160),
        new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      const node = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 12),
        new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      node.position.set(rad, 0, 0);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({
        map: labelTexture(text, css, 'rgba(8,6,5,0.82)', css),
        transparent: true, opacity: 0, depthWrite: false, toneMapped: false
      }));
      label.scale.set(0.65, 0.23, 1); label.position.set(0.04, 0.24, 0); node.add(label);
      ring.add(node); holder.add(ring); ringsGroup.add(holder); ringList.push({ ring, node, label, spin });
    });
    ringsGroup.scale.setScalar(0.4);

    // 9. TOPOGRAPHIC WIREFRAME OCEAN SHADER (Scene 05)
    const terrainMat = new THREE.ShaderMaterial({
      wireframe: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime:    { value: 0 },
        uAmp:     { value: 0 },
        uOpacity: { value: 0 },
        uSunset:  { value: new THREE.Color(1.0, 0.38, 0.16) }, // #FF6129
        uCyan:    { value: new THREE.Color(0.22, 0.74, 0.97) }, // #38BDF8
      },
      vertexShader: `
        uniform float uTime, uAmp; varying float vH; varying float vD;
        float field(vec2 p, float t){
          float h = sin(p.x*0.55 + t*0.65)*0.5 + sin(p.y*0.43 - t*0.45)*0.5;
          h += sin((p.x+p.y)*0.9 + t*0.95)*0.25; h += sin(length(p)*0.7 - t*0.8)*0.35; return h;
        }
        void main(){
          vec3 pos = position; float h = field(pos.xz, uTime); pos.y += h*uAmp; vH = h; vD = length(pos.xz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity; uniform vec3 uSunset, uCyan; varying float vH; varying float vD;
        void main(){
          vec3 c = mix(uSunset, uCyan, smoothstep(-0.55, 0.55, vH));
          float fade = 1.0 - smoothstep(5.0, 11.0, vD);
          float a = uOpacity * fade * (0.35 + 0.65*smoothstep(-1.0, 1.0, abs(vH)+0.15));
          gl_FragColor = vec4(c * 1.45, a);
        }
      `,
    });
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(22, 22, 28, 28).rotateX(-Math.PI / 2), terrainMat);
    terrain.position.set(0, -9, -2); terrain.frustumCulled = false; scene.add(terrain);

    // 10. DECELERATION SHOCKWAVE RING (Scene 10)
    const shockwaveGeo = new THREE.RingGeometry(0.1, 0.22, 64).rotateX(-Math.PI / 2);
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: COL.sunset, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const shockwaveRing = new THREE.Mesh(shockwaveGeo, shockwaveMat);
    shockwaveRing.position.set(0, -1.35, 0); scene.add(shockwaveRing);

    // 11. ANALYTICAL HUD BADGES (70% WIN RATE & PROFIT FACTOR 2.4) (Scene 12)
    const winRateBadge = new THREE.Sprite(new THREE.SpriteMaterial({
      map: circularBadgeTexture('70%', 'WIN RATE', '#22c55e', '#22c55e'),
      transparent: true, opacity: 0, depthWrite: false
    }));
    winRateBadge.scale.set(0.9, 0.9, 1); winRateBadge.position.set(-2.2, 0.35, 0);

    const pfBadge = new THREE.Sprite(new THREE.SpriteMaterial({
      map: circularBadgeTexture('2.4', 'PROFIT FACTOR', '#38bdf8', '#38bdf8'),
      transparent: true, opacity: 0, depthWrite: false
    }));
    pfBadge.scale.set(0.9, 0.9, 1); pfBadge.position.set(2.2, 0.35, 0);
    parallax.add(winRateBadge, pfBadge);

    // 12. MULTI-PORTFOLIO PEDESTALS & CLONES (Scene 13)
    const pedestalGroup = new THREE.Group(); scene.add(pedestalGroup);
    const pedGeo = new THREE.CylinderGeometry(1.2, 1.35, 0.35, 32);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x110e0c, metalness: 0.85, roughness: 0.25 });
    [-2.4, 0, 2.4].forEach(x => {
      const p = new THREE.Mesh(pedGeo, pedMat);
      p.position.set(x, -1.6, 0); pedestalGroup.add(p);
    });
    pedestalGroup.position.y = -6; // starts below screen

    const cloneLeft = coinBody.clone(), cloneRight = coinBody.clone();
    cloneLeft.scale.setScalar(0.0001); cloneRight.scale.setScalar(0.0001);
    cloneLeft.position.set(-2.4, 0, 0); cloneRight.position.set(2.4, 0, 0);
    parallax.add(cloneLeft, cloneRight);

    // 13. BLUEPRINT MATRIX FLOOR (Scene 14)
    const bpFloorGeo = new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2);
    const bpFloorMat = new THREE.MeshBasicMaterial({
      map: createBlueprintTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const blueprintFloor = new THREE.Mesh(bpFloorGeo, bpFloorMat);
    blueprintFloor.position.y = -1.35; scene.add(blueprintFloor);

    // 14. APPROACHING 3D DASHBOARD TABLET SURFACE (Scene 15)
    const tabletGeo = new THREE.PlaneGeometry(8.5, 5.2).rotateX(-Math.PI / 2.3);
    const tabletMat = new THREE.MeshStandardMaterial({
      map: createDashboardTexture(),
      color: 0xffffff,
      emissive: COL.sunset,
      emissiveIntensity: 0.15,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity: 0,
    });
    const dashboardTablet = new THREE.Mesh(tabletGeo, tabletMat);
    dashboardTablet.position.set(0, -1.65, -0.4); scene.add(dashboardTablet);

    // 15. PARTICLES (GOLDEN/SUNSET MOTES) & HYPERSPACE WARP STREAKS (Scene 08, 09)
    const PN = 350, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pPhase = new Float32Array(PN), pRate = new Float32Array(PN);
    const pr = mulberry32(77), gold = new THREE.Color(COL.gold), snt = new THREE.Color(COL.sunset), tmp = new THREE.Color();
    for (let i = 0; i < PN; i++) {
      pPos[i * 3]     = (pr() - 0.5) * 20;
      pPos[i * 3 + 1] = (pr() - 0.5) * 12;
      pPos[i * 3 + 2] = -16 + pr() * 24;
      tmp.copy(gold).lerp(snt, pr() > 0.5 ? pr() : 0);
      pCol.set([tmp.r, tmp.g, tmp.b], i * 3);
      pPhase[i] = pr() * 6.283; pRate[i] = 0.6 + pr() * 0.9;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.12, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false,
      blending: THREE.AdditiveBlending, map: glowSpriteTexture('rgba(255,255,255,1)', 'rgba(255,179,71,0.45)'),
    }));
    particles.frustumCulled = false; scene.add(particles);

    const SN = 220, sPos = new Float32Array(SN * 6), sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const streaks = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({
      color: COL.sunset, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    }));
    streaks.frustumCulled = false; scene.add(streaks);

    return {
      renderer, scene, camera, envRT, rig, parallax, coinGroup, coinBody,
      frontLens, backPlate, rimMesh, neonBevelMesh, milledMesh, centerCore, tube,
      tubeIdx: { count: tubeIdxCount, seg: TUBE_SEG, rad: TUBE_RAD },
      crystalPrism, halo, centerFlare, hudGroup, hudRing1, hudRing2, riskLabel,
      ringsGroup, ringList, terrain, terrainMat, shockwaveRing,
      winRateBadge, pfBadge, pedestalGroup, cloneLeft, cloneRight,
      blueprintFloor, dashboardTablet, particles, pGeo, pPos, pPhase, pRate, PN,
      streaks, sGeo, sPos, SN, LENS_Z, COIN_R
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  TIMELINE & 16-SCENE CONTINUOUS ANIMATION
  // ═══════════════════════════════════════════════════════════════════════════
  function start() {
    const container = $('scrolly-container'), canvas = $('webgl-canvas');
    const run = S.run = {
      container, canvas, raf: 0, last: performance.now(), t: 0, renderOn: true,
      listeners: [], mouse: { x: 0, y: 0, tx: 0, ty: 0 }, ema: 1 / 60, frames: 0
    };
    const sc = run.sc = buildScene(canvas), { renderer, scene, camera } = sc;
    const aspect = () => canvas.clientWidth / canvas.clientHeight;
    const baseZ = () => (aspect() < 1 ? 6.2 / aspect() : 5.4);

    const cam = run.cam = { x: 0, y: 0, z: baseZ(), lookY: 0 };
    const PK  = run.PK  = { v: 1.0 };
    const RS  = run.RS  = { speed: 0.9 };
    const RF  = run.RF  = { v: 0 };
    const P   = run.P   = { speed: 0.9 };
    const DRAW = run.DRAW = { v: 0 };

    function dockInfo() {
      const target = document.querySelector('.app-nav-rail .nav-logo.logo-mark') ||
                     document.querySelector('.nav-logo') ||
                     document.querySelector('.logo-mark');
      if (!target) return { x: -2.2, y: 1.8, s: 0.18 };
      const r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const dc = new THREE.PerspectiveCamera(camera.fov, aspect(), camera.near, camera.far);
      dc.position.set(0, 0, baseZ()); dc.lookAt(0, 0, 0);
      dc.updateMatrixWorld(true); dc.updateProjectionMatrix();
      const ndc = new THREE.Vector3((cx / canvas.clientWidth) * 2 - 1, -(cy / canvas.clientHeight) * 2 + 1, 0.5).unproject(dc);
      const dir = ndc.sub(dc.position).normalize(), t = -dc.position.z / dir.z, w = dc.position.clone().add(dir.multiplyScalar(t));
      const upx = (2 * Math.tan(THREE.MathUtils.degToRad(dc.fov / 2)) * dc.position.z) / canvas.clientHeight;
      const s = (Math.max(r.width, r.height) * upx) / (sc.COIN_R * 2);
      return { x: w.x, y: w.y, s };
    }

    cam.z = baseZ();
    sc.rig.position.set(0, 0.45, 0);

    // ─── 16-SCENE GSAP TIMELINE ──────────────────────────────────────────────
    const tl = run.tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: container, start: 'top top', end: 'bottom bottom', scrub: 1, invalidateOnRefresh: true,
        onUpdate: self => {
          const bar = $('scrolly-progress');
          if (bar) bar.style.transform = `scaleX(${self.progress})`;
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

    // SCENE 01 ➔ 02 (0% – 6.5%): Genesis Awakening & 3D Tilt
    tl.to('#frame-1', { autoAlpha: 0, y: -40, duration: 4 }, 3);
    tl.to(rot, { x: 0.18, y: -0.55, z: 0.10, duration: 6.5 }, 0);
    tl.to(rp, { y: 0.1, duration: 6.5 }, 0);

    // SCENE 02 ➔ 03 (6.5% – 13%): Crystal Pyramid Morph & Macro Candlestick Push-in
    tl.to(cam, { z: () => baseZ() * 0.72, duration: 6.5 }, 6.5);
    tl.to(rot, { x: 0.08, y: -0.22, z: 0.02, duration: 6.5 }, 6.5);
    tl.to(sc.crystalPrism.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 4 }, 7.5);
    tl.to(sc.crystalPrism.material, { opacity: 0.88, duration: 4 }, 7.5);

    // SCENE 03 ➔ 04 (13% – 19.5%): 45-degree Isometric Tilt & Low-Angle Horizon Float
    tl.to(sc.crystalPrism.scale, { x: 0.0001, y: 0.0001, z: 0.0001, duration: 3.5 }, 13);
    tl.to(sc.crystalPrism.material, { opacity: 0, duration: 3 }, 13);
    tl.to(cam, { z: () => baseZ() * 0.95, duration: 6.5 }, 13);
    tl.to(rot, { x: 0.38, y: -0.92, z: 0.18, duration: 6.5 }, 13);

    // SCENE 04 ➔ 05 (19.5% – 26%): Lift-off & Topographic Wireframe Ocean
    tl.to(rp, { y: 0.75, duration: 6.5 }, 19.5);
    tl.to(sc.terrain.position, { y: -2.2, duration: 6.5 }, 19.5);
    tl.to(sc.terrainMat.uniforms.uAmp, { value: 1.0, duration: 6.5 }, 19.5);
    tl.to(sc.terrainMat.uniforms.uOpacity, { value: 1.0, duration: 5 }, 19.5);
    fade('#frame-5', 20, 2.5, 27);

    // SCENE 05 ➔ 06 (26% – 32.5%): HUD Risk Ring & '1.0% RISK'
    tl.to(rot, { x: 0.05, y: -0.1, z: 0, duration: 6.5 }, 26);
    tl.to([sc.hudRing1.material, sc.hudRing2.material, sc.riskLabel.material], { opacity: 1, duration: 4 }, 26);

    // SCENE 06 ➔ 07 (32.5% – 39%): Orbital +2.5R & +3.8R Energy Rings
    tl.to(RF, { v: 1, duration: 4 }, 32.5);
    tl.to(sc.ringsGroup.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 6.5 }, 32.5);
    tl.to(RS, { speed: 2.2, duration: 6.5 }, 32.5);
    tl.to(rot, { x: 0.22, y: 0.5, z: 0.05, duration: 6.5 }, 32.5);
    fade('#frame-7', 33, 2.5, 40);

    // SCENE 07 ➔ 08 (39% – 45.5%): Centrifugal Energy Burst & Lens Flare
    tl.to(sc.centerFlare.material, { opacity: 1, duration: 3 }, 39);
    tl.to(sc.centerFlare.scale, { x: 4.8, y: 4.8, duration: 4 }, 39);
    tl.to(P, { speed: 6.0, duration: 6.5 }, 39);

    // SCENE 08 ➔ 09 (45.5% – 52%): Hyperspace Warp Drive Streaks
    tl.to(sc.centerFlare.material, { opacity: 0, duration: 2 }, 45.5);
    tl.to(sc.streaks.material, { opacity: 0.95, duration: 2 }, 45.5);
    tl.to(P, { speed: 14.0, duration: 6.5 }, 45.5);
    tl.to(cam, { z: () => baseZ() * 0.65, duration: 6.5 }, 45.5);

    // SCENE 09 ➔ 10 (52% – 58.5%): Deceleration Shockwave Ring
    tl.to(P, { speed: 0.5, duration: 4 }, 52);
    tl.to(sc.streaks.material, { opacity: 0, duration: 3 }, 52);
    tl.to(sc.shockwaveRing.material, { opacity: 0.9, duration: 1.5 }, 52);
    tl.to(sc.shockwaveRing.scale, { x: 28, y: 28, duration: 6 }, 52);
    tl.to(sc.shockwaveRing.material, { opacity: 0, duration: 4 }, 54);

    // SCENE 10 ➔ 11 (58.5% – 65%): Exploded 3-Tier Layer Disassembly
    tl.to(sc.frontLens.position, { z: () => sc.LENS_Z + 1.25, duration: 6.5 }, 58.5);
    tl.to(sc.backPlate.position, { z: () => -sc.LENS_Z - 1.25, duration: 6.5 }, 58.5);
    tl.to(sc.centerCore.scale, { z: 2.8, duration: 6.5 }, 58.5);
    tl.to(DRAW, { v: 1, duration: 6.5, ease: 'none', onUpdate: () => {
      const n = Math.floor(DRAW.v * sc.tubeIdx.seg) * sc.tubeIdx.rad * 6; sc.tube.geometry.setDrawRange(0, n);
    } }, 58.5);
    tl.to(rot, { x: 0.38, y: -1.1, z: 0.15, duration: 6.5 }, 58.5);
    fade('#frame-11', 59, 2.5, 66);

    // SCENE 11 ➔ 12 (65% – 71.5%): 70% Win Rate & Profit Factor HUD
    tl.to([sc.winRateBadge.material, sc.pfBadge.material], { opacity: 1, duration: 3 }, 65);
    tl.to(sc.frontLens.position, { z: sc.LENS_Z, duration: 4, ease: 'power3.in' }, 67.5);
    tl.to(sc.backPlate.position, { z: -sc.LENS_Z, duration: 4, ease: 'power3.in' }, 67.5);
    tl.to(sc.centerCore.scale, { z: 1.0, duration: 4, ease: 'power3.in' }, 67.5);

    // SCENE 12 ➔ 13 (71.5% – 78%): Multi-Account Triplication on Pedestals
    tl.to([sc.winRateBadge.material, sc.pfBadge.material], { opacity: 0, duration: 2 }, 71.5);
    tl.to(sc.pedestalGroup.position, { y: 0, duration: 6.5 }, 71.5);
    tl.to(sc.cloneLeft.scale, { x: 1, y: 1, z: 1, duration: 5, ease: 'back.out(1.6)' }, 72.5);
    tl.to(sc.cloneRight.scale, { x: 1, y: 1, z: 1, duration: 5, ease: 'back.out(1.6)' }, 73.5);
    fade('#frame-13', 72, 2.5, 79);

    // SCENE 13 ➔ 14 (78% – 84.5%): Blueprint Motherboard Floor Matrix
    tl.to([sc.cloneLeft.scale, sc.cloneRight.scale], { x: 0.0001, y: 0.0001, z: 0.0001, duration: 4 }, 78);
    tl.to(sc.pedestalGroup.position, { y: -6, duration: 5 }, 78);
    tl.to(sc.blueprintFloor.material, { opacity: 0.85, duration: 6.5 }, 78);
    tl.to(sc.terrainMat.uniforms.uOpacity, { value: 0, duration: 4 }, 78);
    tl.to(cam, { y: 2.5, lookY: -0.4, z: () => baseZ() * 0.9, duration: 6.5 }, 78);
    tl.to(rot, { x: -1.2, y: 0, z: 0, duration: 6.5 }, 78);

    // SCENE 14 ➔ 15 (84.5% – 91%): Approach to 3D Dashboard Plane
    tl.to(sc.dashboardTablet.material, { opacity: 0.92, duration: 5 }, 84.5);
    tl.to(rp, { y: 0.25, duration: 6.5 }, 84.5);

    // SCENE 15 ➔ 16 (91% – 100%): Grand Docking into Header Navigation Logo
    tl.to(cam, { x: 0, y: 0, z: () => baseZ(), lookY: 0, duration: 8 }, 91);
    tl.to(rot, { x: 0, y: 0, z: 0, duration: 7 }, 91);
    tl.to(rp, { x: () => dockInfo().x, y: () => dockInfo().y, z: 0, duration: 9, ease: 'power3.inOut' }, 91);
    tl.to(rs, { x: () => dockInfo().s, y: () => dockInfo().s, z: () => dockInfo().s, duration: 9, ease: 'power3.inOut' }, 91);
    tl.to(sc.blueprintFloor.material, { opacity: 0, duration: 4 }, 91);
    tl.to(sc.dashboardTablet.material, { opacity: 0, duration: 4 }, 91);
    tl.to(sc.particles.material, { opacity: 0, duration: 4 }, 93);
    tl.to(sc.halo.material, { opacity: 0, duration: 5 }, 93);
    tl.to(PK, { v: 0, duration: 8 }, 91);
    tl.to('.nav-logo', { opacity: 1, duration: 2 }, 98);
    tl.to(canvas, { opacity: 0, duration: 2 }, 98);
    tl.set({}, {}, 100);

    // Smooth Scrolling with Lenis
    run.lenis = new Lenis({ duration: 1.25, smoothWheel: true });
    run.lenis.on('scroll', ScrollTrigger.update);

    // Window listeners
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
    ScrollTrigger.refresh();
    run.raf = requestAnimationFrame(frame);
  }

  // ─── PER-FRAME RENDER LOOP ──────────────────────────────────────────────────
  function frame(now) {
    const run = S.run; if (!run) return;
    run.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    if (run.lenis) run.lenis.raf(now);
    if (!run.renderOn) return;

    run.t += dt;
    const { scene, camera, renderer, parallax, ringList, terrainMat, particles, pPos, PN, streaks, sPos, SN } = run.sc;

    // Camera follow lookY
    camera.position.set(run.cam.x, run.cam.y, run.cam.z);
    camera.lookAt(0, run.cam.lookY, 0);

    // Mouse parallax
    run.mouse.x += (run.mouse.tx - run.mouse.x) * 0.08;
    run.mouse.y += (run.mouse.ty - run.mouse.y) * 0.08;
    const pk = run.PK.v;
    parallax.position.x = run.mouse.x * 0.22 * pk;
    parallax.position.y = -run.mouse.y * 0.16 * pk;
    parallax.rotation.y = run.mouse.x * 0.18 * pk;
    parallax.rotation.x = -run.mouse.y * 0.12 * pk;

    // Rings spin
    ringList.forEach(r => {
      r.ring.rotation.z += dt * run.RS.speed * r.spin;
      r.ring.material.opacity = run.RF.v * 0.85;
      r.node.material.opacity = run.RF.v * 0.95;
      r.label.material.opacity = run.RF.v * 0.95;
    });

    // Terrain animation
    terrainMat.uniforms.uTime.value = run.t;

    // Particles motion
    const pSpeed = run.P.speed;
    for (let i = 0; i < PN; i++) {
      let z = pPos[i * 3 + 2] + dt * pSpeed;
      if (z > 8) z = -16;
      pPos[i * 3 + 2] = z;
    }
    run.sc.pGeo.attributes.position.needsUpdate = true;

    // Streaks motion
    if (streaks.material.opacity > 0.01) {
      for (let i = 0; i < SN; i++) {
        let z = sPos[i * 6 + 2] + dt * pSpeed * 2.2;
        if (z > 8) z = -18;
        sPos[i * 6 + 2] = z;
        sPos[i * 6 + 5] = z - 1.8;
      }
      run.sc.sGeo.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  // ─── TEARDOWN & FINISH ──────────────────────────────────────────────────────
  function finish({ seen } = { seen: true }) {
    if (S.finishing || S.phase === 'done') return;
    S.finishing = true; S.phase = 'done';
    if (seen) markSeen();

    const run = S.run;
    if (run) {
      cancelAnimationFrame(run.raf);
      run.listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
      if (run.st) run.st.kill();
      if (run.tl) run.tl.kill();
      if (run.lenis) run.lenis.destroy();
      const sc = run.sc;
      if (sc) {
        sc.scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
            else o.material.dispose();
          }
        });
        sc.renderer.dispose();
      }
    }

    document.documentElement.classList.remove('intro-active');
    $('scrolly-container')?.remove();
    document.body.style.overflow = '';
    window.scrollTo(0, 0);
  }

  function skip() { finish({ seen: true }); }
  window.skipToDashboard = skip;

  // ─── PREPARE / BOOT ─────────────────────────────────────────────────────────
  async function prepare() {
    if (!shouldPlay()) {
      $('scrolly-container')?.remove();
      return;
    }
    document.documentElement.classList.add('intro-active');
    try {
      await loadLibs();
      start();
    } catch (err) {
      console.warn('Scrolly3D fallback:', err);
      finish({ seen: false });
    }
  }

  // Expose both prepare, skip, and teardown (called by auth.js)
  window.ScrollyIntro = { prepare, skip, teardown: () => finish({ seen: false }) };
})();
