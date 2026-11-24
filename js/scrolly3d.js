/* ════════════════════════════════════════════════════════════════════════════
   TrackTrade — 3D cinematic scrollytelling intro  (Sprint 3)

   Flow:  login → showApp() → ScrollyIntro.prepare()
            ├─ not first visit / reduced motion / data-saver / no WebGL → dashboard as usual
            └─ otherwise: lazy-load three · gsap · ScrollTrigger · Lenis, build the scene,
               play the 9-frame story on scroll, dock the coin into the header logo,
               then remove the whole intro (DOM, listeners, GPU memory) and hand the page back.

   Everything 3D is procedural — no model/texture files. Nothing here runs unless the
   intro is going to play.  Replay any time with  ?intro=1
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SEEN_KEY = 'tt_intro_seen_v1';
  const LIBS = {                                   // exact versions from the Sprint 3 brief
    three:  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    gsap:   'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
    st:     'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
    lenis:  'https://unpkg.com/lenis@1.1.18/dist/lenis.min.js',
  };
  const COL = { lime: 0xc8f03c, green: 0x3cffa0, cyan: 0x38bdf8, red: 0xff4560, gold: 0xffd36b };
  const $ = id => document.getElementById(id);

  // phase: idle → loading → active → done      (teardown() puts an unfinished intro back to idle)
  const S = { phase: 'idle', finishing: false, run: null, prevRestoration: null };

  // ─── small helpers ──────────────────────────────────────────────────────────
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function mulberry32(a) {                         // tiny seeded PRNG → identical art on every run
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch (_) { /* private mode */ } };

  function shouldPlay() {
    const mm = q => window.matchMedia && window.matchMedia(q).matches;
    if (mm('(prefers-reduced-motion: reduce)')) return false;                 // accessibility: never force motion
    if (navigator.connection && navigator.connection.saveData) return false;  // data-saver: ~730 KB of libs
    if (new URLSearchParams(location.search).get('intro') === '1') return true;   // dev/replay switch
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

  // ═══════════════════════════════════════════════════════════════════════════
  //  PROCEDURAL ART  (canvas textures, no files)
  // ═══════════════════════════════════════════════════════════════════════════
  const mkCanvas = n => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };

  function brushedMetal(g, N, rng) {
    const bg = g.createRadialGradient(N / 2, N / 2, N * 0.04, N / 2, N / 2, N * 0.5);
    bg.addColorStop(0, '#303a49'); bg.addColorStop(0.65, '#19202b'); bg.addColorStop(1, '#0b0f15');
    g.fillStyle = bg; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 700; i++) {                              // fine brushing
      g.globalAlpha = 0.025 + rng() * 0.05;
      g.fillStyle = rng() > 0.5 ? '#fff' : '#000';
      g.fillRect(0, rng() * N, N, 1 + (rng() > 0.8 ? 1 : 0));
    }
    g.globalAlpha = 1;
  }

  function coinFaceTextures(kind, maxAniso) {
    const N = 1024, rng = mulberry32(kind === 'top' ? 11 : 29);
    const albedo = mkCanvas(N), glow = mkCanvas(N);
    const a = albedo.getContext('2d'), e = glow.getContext('2d');
    brushedMetal(a, N, rng);
    e.fillStyle = '#000'; e.fillRect(0, 0, N, N);

    const both = fn => { fn(a, 0.55); fn(e, 1); };                // draw on albedo (dim) + emissive (full)
    // bezel rings + dial ticks
    both((g, k) => {
      g.save(); g.lineCap = 'round';
      g.strokeStyle = `rgba(60,255,160,${0.95 * k})`; g.lineWidth = 9; g.shadowColor = '#3cffa0'; g.shadowBlur = k === 1 ? 22 : 0;
      g.beginPath(); g.arc(N / 2, N / 2, N * 0.455, 0, Math.PI * 2); g.stroke();
      g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = `rgba(56,189,248,${0.7 * k})`;
      g.beginPath(); g.arc(N / 2, N / 2, N * 0.40, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 72; i++) {
        const ang = (i / 72) * Math.PI * 2, long = i % 6 === 0, r0 = N * (long ? 0.405 : 0.418), r1 = N * 0.435;
        g.strokeStyle = `rgba(200,240,60,${(long ? 0.9 : 0.45) * k})`; g.lineWidth = long ? 4 : 2;
        g.beginPath(); g.moveTo(N / 2 + Math.cos(ang) * r0, N / 2 + Math.sin(ang) * r0);
        g.lineTo(N / 2 + Math.cos(ang) * r1, N / 2 + Math.sin(ang) * r1); g.stroke();
      }
      g.restore();
    });

    if (kind === 'top') {
      both((g, k) => {                                            // ▲ logo (drawn as a path — no font dependency)
        g.save(); g.fillStyle = `rgba(200,240,60,${k})`; g.shadowColor = '#c8f03c'; g.shadowBlur = k === 1 ? 34 : 0;
        const cx = N / 2, cy = N * 0.355, s = N * 0.2;
        g.beginPath(); g.moveTo(cx, cy - s * 0.92); g.lineTo(cx + s, cy + s * 0.62); g.lineTo(cx - s, cy + s * 0.62); g.closePath(); g.fill();
        g.restore();
      });
      both((g, k) => {                                            // candlesticks, trending up
        const n = 13, x0 = N * 0.22, x1 = N * 0.78, base = N * 0.80, r = mulberry32(5);
        for (let i = 0; i < n; i++) {
          const x = x0 + (i / (n - 1)) * (x1 - x0), trend = (i / (n - 1)) * N * 0.10;
          const up = r() > 0.34, h = N * (0.03 + r() * 0.06), mid = base - trend - r() * N * 0.04, wick = h * (0.7 + r() * 0.6);
          g.save(); g.shadowBlur = k === 1 ? 12 : 0;
          const c = up ? '60,255,160' : '255,69,96'; g.shadowColor = `rgb(${c})`;
          g.strokeStyle = `rgba(${c},${0.95 * k})`; g.fillStyle = `rgba(${c},${0.9 * k})`; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x, mid - h / 2 - wick); g.lineTo(x, mid + h / 2 + wick); g.stroke();
          g.fillRect(x - N * 0.014, mid - h / 2, N * 0.028, h);
          g.restore();
        }
      });
      both((g, k) => {                                            // wordmark
        g.save(); g.fillStyle = `rgba(232,234,240,${0.8 * k})`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `700 ${Math.round(N * 0.038)}px Inter, system-ui, sans-serif`;
        if ('letterSpacing' in g) g.letterSpacing = Math.round(N * 0.012) + 'px';
        g.fillText('TRACKTRADE', N / 2, N * 0.895); g.restore();
      });
    } else {
      both((g, k) => {                                            // bottom face: big "R" + rising line
        g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = `rgba(200,240,60,${k})`;
        g.shadowColor = '#c8f03c'; g.shadowBlur = k === 1 ? 30 : 0; g.font = `800 ${Math.round(N * 0.34)}px Inter, system-ui, sans-serif`;
        g.fillText('R', N / 2, N * 0.43); g.restore();
        g.save(); g.strokeStyle = `rgba(60,255,160,${k})`; g.lineWidth = 6; g.lineJoin = 'round'; g.shadowColor = '#3cffa0'; g.shadowBlur = k === 1 ? 18 : 0;
        const r = mulberry32(8); g.beginPath();
        for (let i = 0; i <= 28; i++) { const x = N * 0.22 + (i / 28) * N * 0.56, y = N * 0.78 - (i / 28) * N * 0.16 + (r() - 0.5) * N * 0.05; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke(); g.restore();
      });
    }
    const mk = c => { const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso; return t; };
    return { map: mk(albedo), glow: mk(glow) };
  }

  function plainMetalTexture(maxAniso) {
    const N = 512, c = mkCanvas(N); brushedMetal(c.getContext('2d'), N, mulberry32(3));
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = maxAniso; return t;
  }
  function reededEdgeTexture() {
    const c = mkCanvas(256), g = c.getContext('2d');
    g.fillStyle = '#1c232e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 4) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(i, 0, 1, 256); g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(i + 2, 0, 2, 256); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 1); return t;
  }
  function glowSpriteTexture(inner, outer) {
    const c = mkCanvas(256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function labelTexture(text, color) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
    g.font = '800 56px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color; g.fillText(text, 128, 50);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // soft studio environment so the metal has something to reflect (PMREM from a tiny scene)
  function buildEnvironment(renderer) {
    const env = new THREE.Scene(); env.background = new THREE.Color(0x04060a);
    const panel = (hex, k, w, h, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(0xffffff, 3.2, 9, 3, [0, 6, 3]); panel(COL.green, 2.6, 3, 9, [-6, 0, 1]);
    panel(COL.cyan, 2.6, 3, 9, [6, 0, 1]); panel(0xffffff, 1.3, 10, 3, [0, -5, 4]); panel(0xffffff, 1.6, 6, 6, [0, 0, 8]);
    const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(env, 0.04); pm.dispose();
    env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    return rt;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  SCENE
  // ═══════════════════════════════════════════════════════════════════════════
  function buildScene(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));      // DPR clamp
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    const envRT = buildEnvironment(renderer); scene.environment = envRT.texture;
    const aniso = renderer.capabilities.getMaxAnisotropy();

    // lights: ambient + two glowing point lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const lGreen = new THREE.PointLight(COL.green, 1.5, 22); lGreen.position.set(4, 2.5, 5); scene.add(lGreen);
    const lCyan = new THREE.PointLight(COL.cyan, 1.4, 22);  lCyan.position.set(-4, -2, 4); scene.add(lCyan);

    // ── hierarchy:  rig (timeline: position/scale) → parallax (mouse + idle) → coinGroup (timeline: rotation)
    const rig = new THREE.Group(), parallax = new THREE.Group(), coinGroup = new THREE.Group(), coinBody = new THREE.Group();
    scene.add(rig); rig.add(parallax); parallax.add(coinGroup); coinGroup.add(coinBody);
    coinBody.rotation.x = Math.PI / 2;                 // coin axis is local Y; rotation (0,0,0) ⇒ top face looks at the camera

    // ── materials
    const top = coinFaceTextures('top', aniso), bot = coinFaceTextures('bottom', aniso), plain = plainMetalTexture(aniso);
    const metal = (map, glow) => new THREE.MeshStandardMaterial({
      color: 0xffffff, map, metalness: 0.88, roughness: 0.42, envMapIntensity: 0.8,
      emissive: 0xffffff, emissiveMap: glow || null, emissiveIntensity: glow ? 0.72 : 0,
    });
    const matTop = metal(top.map, top.glow), matBot = metal(bot.map, bot.glow), matInner = metal(plain, null);
    const matEdge = new THREE.MeshStandardMaterial({ map: reededEdgeTexture(), metalness: 0.9, roughness: 0.38, envMapIntensity: 1.0 });
    const matGlass = new THREE.MeshPhysicalMaterial({
      // transmission 0.8 per the brief. In three r128 (pinned via the CDN URL) it is a cheap see-through term — verified: same
      // 38 draw calls, no artifacts. Newer three versions add a full extra transmission render pass: re-check cost before upgrading.
      color: 0x8fffd0, metalness: 0, roughness: 0.1, transmission: 0.8, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.08, emissive: COL.green, emissiveIntensity: 0.28, envMapIntensity: 1.6,
    });
    const neon = (hex) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });

    // ── cap = outer face + inner face + reeded rim + neon edge
    const CAP_T = 0.12, CAP_Y = 0.29, R = 1;
    function makeCap(sign, faceMat) {                  // sign +1 top, -1 bottom
      const g = new THREE.Group();
      const outer = new THREE.Mesh(new THREE.CircleGeometry(R, 96).rotateX(sign * -Math.PI / 2), faceMat); outer.position.y = sign * CAP_T / 2;
      const inner = new THREE.Mesh(new THREE.CircleGeometry(R, 96).rotateX(sign * Math.PI / 2), matInner); inner.position.y = -sign * CAP_T / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(R, R, CAP_T, 96, 1, true), matEdge);
      const edge = new THREE.Mesh(new THREE.TorusGeometry(R + 0.012, 0.017, 10, 128).rotateX(Math.PI / 2), neon(COL.green)); edge.position.y = -sign * CAP_T / 2;
      g.add(outer, inner, rim, edge); g.position.y = sign * CAP_Y; return g;
    }
    const topCap = makeCap(1, matTop), bottomCap = makeCap(-1, matBot);
    const glassRim = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, CAP_Y * 2 - CAP_T, 96, 1, true), matGlass);
    glassRim.renderOrder = 2;

    // ── inner core: wireframe cylinder + mini equity curve standing in the XY plane (grows when exploded)
    const innerCore = new THREE.Group();
    innerCore.add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.38, 28, 3, true),
      new THREE.MeshBasicMaterial({ color: COL.green, wireframe: true, transparent: true, opacity: 0.5, toneMapped: false })));
    const rng = mulberry32(42), pts = []; let v = 0.12;
    for (let i = 0; i < 40; i++) { v = clamp(v + 0.021 + (rng() - 0.42) * 0.075, 0.02, 0.98); pts.push(new THREE.Vector3(0, (i / 39 - 0.5) * 0.38, (v - 0.5) * 1.05)); }
    const curve = new THREE.CatmullRomCurve3(pts), TUBE_SEG = 160, TUBE_RAD = 6;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, TUBE_SEG, 0.011, TUBE_RAD, false), neon(COL.lime));
    const idxCount = tube.geometry.index.count; tube.geometry.setDrawRange(0, 0);
    innerCore.add(tube);
    const gridMat = new THREE.LineBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.22, toneMapped: false });
    const gl = []; [-0.35, 0, 0.35].forEach(z => gl.push(0, -0.19, z, 0, 0.19, z));
    const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
    innerCore.add(new THREE.LineSegments(gridGeo, gridMat));
    const dotGeo = new THREE.SphereGeometry(0.03, 12, 10), dot = new THREE.Mesh(dotGeo, neon(0xffffff)); dot.position.copy(pts[pts.length - 1]); innerCore.add(dot);

    coinBody.add(glassRim, innerCore, topCap, bottomCap);

    // ── soft halo behind the coin (cheap "bloom")
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTexture('rgba(60,255,160,0.55)', 'rgba(56,189,248,0.16)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 }));
    halo.scale.set(5.2, 5.2, 1); halo.position.z = -0.7; parallax.add(halo);

    // ── orbital R-multiple rings (with orbiting nodes + labels)
    const ringsGroup = new THREE.Group(); parallax.add(ringsGroup);
    const ringList = [];
    [[1.75, [1.15, 0.25, 0], COL.green, '+2.5R', '#3cffa0', 0.55], [2.2, [-0.85, -0.45, 0.3], COL.cyan, '+3.8R', '#38bdf8', -0.4]].forEach(([rad, tilt, hex, text, css, spin]) => {
      const holder = new THREE.Group(); holder.rotation.set(tilt[0], tilt[1], tilt[2]);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.012, 10, 160), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false }));
      node.position.set(rad, 0, 0);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, css), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      label.scale.set(0.52, 0.195, 1); label.position.set(0.02, 0.2, 0); node.add(label);
      ring.add(node); holder.add(ring); ringsGroup.add(holder); ringList.push({ ring, node, label, spin });
    });
    ringsGroup.scale.setScalar(0.4);

    // ── profit/loss terrain (wireframe shader)
    const terrainMat = new THREE.ShaderMaterial({
      wireframe: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAmp: { value: 0 }, uOpacity: { value: 0 }, uRed: { value: new THREE.Color(1.0, 0.27, 0.38) }, uGreen: { value: new THREE.Color(0.24, 1.0, 0.63) } },
      vertexShader: `
        uniform float uTime, uAmp; varying float vH; varying float vD;
        float field(vec2 p, float t){
          float h = sin(p.x*0.55 + t*0.6)*0.5 + sin(p.y*0.43 - t*0.45)*0.5;
          h += sin((p.x+p.y)*0.9 + t*0.9)*0.25; h += sin(length(p)*0.7 - t*0.8)*0.35; return h; }
        void main(){ vec3 pos = position; float h = field(pos.xz, uTime); pos.y += h*uAmp; vH = h; vD = length(pos.xz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0); }`,
      fragmentShader: `
        uniform float uOpacity; uniform vec3 uRed, uGreen; varying float vH; varying float vD;
        void main(){ vec3 c = mix(uRed, uGreen, smoothstep(-0.55, 0.55, vH)); float fade = 1.0 - smoothstep(5.0, 10.0, vD);
          float a = uOpacity * fade * (0.30 + 0.70*smoothstep(-1.0, 1.0, abs(vH)+0.15));
          gl_FragColor = vec4(c * 1.35, a); }`,
    });
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(20, 20, 25, 25).rotateX(-Math.PI / 2), terrainMat);
    terrain.position.set(0, -9, -2); terrain.frustumCulled = false; scene.add(terrain);

    // ── blueprint grid (frame 8)
    const grid = new THREE.GridHelper(26, 26, COL.cyan, COL.cyan);
    grid.material.transparent = true; grid.material.opacity = 0; grid.material.depthWrite = false; grid.material.toneMapped = false;
    grid.position.y = -1.25; scene.add(grid);

    // ── particles: 300 golden/green glow motes + speed streaks
    const PN = 300, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pPhase = new Float32Array(PN), pRate = new Float32Array(PN);
    const pr = mulberry32(7), gold = new THREE.Color(COL.gold), grn = new THREE.Color(COL.green), tmp = new THREE.Color();
    for (let i = 0; i < PN; i++) {
      pPos[i * 3] = (pr() - 0.5) * 18; pPos[i * 3 + 1] = (pr() - 0.5) * 10; pPos[i * 3 + 2] = -14 + pr() * 21;
      tmp.copy(gold).lerp(grn, pr() > 0.5 ? pr() : 0); pCol.set([tmp.r, tmp.g, tmp.b], i * 3);
      pPhase[i] = pr() * 6.283; pRate[i] = 0.6 + pr() * 0.8;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 0.11, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false,
      blending: THREE.AdditiveBlending, map: glowSpriteTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.35)'),
    }));
    particles.frustumCulled = false; scene.add(particles);
    const SN = 150, sPos = new Float32Array(SN * 6), sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const streaks = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({ color: COL.green, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    streaks.frustumCulled = false; scene.add(streaks);

    // ── row of mini coins (frame 7)
    const rowCoins = new THREE.Group(); scene.add(rowCoins);
    const miniGeo = { face: new THREE.CircleGeometry(0.5, 64), back: new THREE.CircleGeometry(0.5, 64).rotateY(Math.PI), rim: new THREE.CylinderGeometry(0.5, 0.5, 0.1, 64, 1, true).rotateX(Math.PI / 2) };
    const miniList = [];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      const f = new THREE.Mesh(miniGeo.face, matTop); f.position.z = 0.05;
      const b = new THREE.Mesh(miniGeo.back, matBot); b.position.z = -0.05;
      c.add(f, b, new THREE.Mesh(miniGeo.rim, matEdge));
      c.position.set((i - 2) * 1.15, -1.35 + Math.sin(i * 1.7) * 0.08, 0.2); c.rotation.set(0.15, (i - 2) * -0.12, 0); c.scale.setScalar(0.0001);
      rowCoins.add(c); miniList.push(c);
    }

    return {
      renderer, scene, camera, envRT, rig, parallax, coinGroup, topCap, bottomCap, innerCore, tube, tubeIdx: { count: idxCount, seg: TUBE_SEG, rad: TUBE_RAD },
      ringsGroup, ringList, terrain, terrainMat, grid, particles, pGeo, pPos, pPhase, pRate, PN, streaks, sGeo, sPos, SN, rowCoins, miniList, halo, matGlass, lGreen, lCyan, CAP_Y,
    };
  }

  // viewport-px centre of the ▲'s visible ink (not its line box). Falls back to the box centre.
  function glyphCenter(el, rect) {
    const box = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    try {
      const cs = getComputedStyle(el), g = document.createElement('canvas').getContext('2d');
      g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = g.measureText((el.textContent || '').trim() || '▲');
      if (m.fontBoundingBoxAscent == null || m.actualBoundingBoxAscent == null) return box;
      const lh = parseFloat(cs.lineHeight) || rect.height;
      const baseline = rect.top + (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      return { x: box.x, y: baseline - (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2 };
    } catch (_) { return box; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  START / TIMELINE
  // ═══════════════════════════════════════════════════════════════════════════
  function start() {
    const container = $('scrolly-container'), canvas = $('webgl-canvas');
    const run = S.run = { container, canvas, raf: 0, last: performance.now(), t: 0, renderOn: true, listeners: [], mouse: { x: 0, y: 0, tx: 0, ty: 0 }, ema: 1 / 60, frames: 0 };
    const sc = run.sc = buildScene(canvas), { renderer, scene, camera } = sc;
    gsap.registerPlugin(ScrollTrigger);

    // loop-driven values the timeline tweens
    const P = run.P = { speed: 0.25 };         // particle speed (units/s)
    const RF = run.RF = { v: 0 };              // rings fade
    const RS = run.RS = { speed: 0.4 };        // rings spin
    const EX = run.EX = { v: 0 };              // explode amount (spin boost)
    const PK = run.PK = { v: 1 };              // idle-float + mouse-parallax strength (→ 0 while docking)
    const DRAW = { v: 0 };
    const cam = run.cam = { x: 0, y: 0, z: 6, lookY: 0 };

    // portrait screens: pull the camera back and shrink lateral offsets so the coin never leaves the frame
    const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const baseZ  = () => 6 * clamp(1.15 / Math.max(aspect(), 0.1), 1, 1.7);
    const kx     = () => clamp(aspect() / 1.5, 0.35, 1);

    // where the header logo will sit when scrolling ends, in world space at the coin's depth
    function dockInfo() {
      const logo = document.querySelector('header .logo-mark'); if (!logo) return { x: 0, y: 2, s: 0.12 };
      const finalScroll = container.offsetTop + container.offsetHeight - canvas.clientHeight;
      const r = logo.getBoundingClientRect(), gc = glyphCenter(logo, r), cx = gc.x + window.scrollX, cy = gc.y + window.scrollY - finalScroll;
      const dc = new THREE.PerspectiveCamera(camera.fov, aspect(), 0.1, 100); dc.position.set(0, 0, baseZ()); dc.lookAt(0, 0, 0);
      dc.updateMatrixWorld(true); dc.updateProjectionMatrix();
      const ndc = new THREE.Vector3((cx / canvas.clientWidth) * 2 - 1, -(cy / canvas.clientHeight) * 2 + 1, 0.5).unproject(dc);
      const dir = ndc.sub(dc.position).normalize(), t = -dc.position.z / dir.z, w = dc.position.clone().add(dir.multiplyScalar(t));
      const upx = (2 * Math.tan(THREE.MathUtils.degToRad(dc.fov / 2)) * dc.position.z) / canvas.clientHeight;
      const s = (Math.max(r.width, r.height) * 1.2 * upx) / 2;
      // the coin's own ▲ sits 17.5% of the diameter above the coin centre — drop the coin so the two triangles coincide
      return { x: w.x, y: w.y - 0.175 * 2 * s, s };
    }

    // ── initial pose
    cam.z = baseZ();
    sc.rig.position.set(0, 0.62, 0);

    // ── the 9-frame timeline  (positions are in percent of the scroll range)
    const tl = run.tl = gsap.timeline({
      defaults: { ease: 'power2.inOut' },
      scrollTrigger: {
        trigger: container, start: 'top top', end: 'bottom bottom', scrub: 1, invalidateOnRefresh: true,
        onUpdate: self => { const bar = $('scrolly-progress'); if (bar) bar.style.transform = `scaleX(${self.progress})`; },
        onToggle: self => { run.renderOn = self.isActive; },
        onLeave: () => finish({ seen: true }),
      },
    });
    run.st = tl.scrollTrigger;
    const rot = sc.coinGroup.rotation, rp = sc.rig.position, rs = sc.rig.scale;
    const fade = (sel, at, dur = 3, out = at + 9) => {                       // text card in → out
      tl.fromTo(sel, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: dur, ease: 'power2.out' }, at);
      tl.to(sel, { autoAlpha: 0, y: -28, duration: dur, ease: 'power2.in' }, out);
    };

    // F1→2 (0–12): tilt  [0,0,0] → [0.2,-0.6,0.1]; hero text leaves
    tl.to('#frame-1', { autoAlpha: 0, y: -40, duration: 5 }, 5);
    tl.to(rot, { x: 0.2, y: -0.6, z: 0.1, duration: 12 }, 0);
    tl.to(rp, { y: 0, duration: 12 }, 0);
    // F3 (12–25): glide right, terrain rises
    tl.to(rp, { x: () => 1.2 * kx(), z: -0.2, duration: 13 }, 12);
    tl.to(rot, { x: 0.1, y: -0.35, z: 0.05, duration: 13 }, 12);
    tl.to(sc.terrain.position, { y: -2.5, duration: 13 }, 12);
    tl.to(sc.terrainMat.uniforms.uAmp, { value: 1, duration: 13 }, 12);
    tl.to(sc.terrainMat.uniforms.uOpacity, { value: 1, duration: 9 }, 12);
    fade('#frame-3', 13, 3, 22);
    // F4 (25–37): glide left, rings spawn / spin / expand
    tl.to(rp, { x: () => -1.0 * kx(), z: 0, duration: 12 }, 25);
    tl.to(RF, { v: 1, duration: 6 }, 25);
    tl.to(sc.ringsGroup.scale, { x: 1.0, y: 1.0, z: 1.0, duration: 12 }, 25);
    tl.to(RS, { speed: 1.8, duration: 12 }, 25);
    tl.to(rot, { x: 0.15, y: 0.4, z: 0, duration: 12 }, 25);
    fade('#frame-4', 26, 3, 35);
    // F5 (37–50): camera pushes forward, particles stream past
    tl.to(cam, { z: () => baseZ() * 0.62, duration: 13 }, 37);
    tl.to(P, { speed: 9, duration: 5, ease: 'power2.in' }, 37);
    tl.to(P, { speed: 0.6, duration: 8, ease: 'power2.out' }, 42);
    tl.to(rp, { x: () => 0.9 * kx(), duration: 13 }, 37);
    tl.to(rs, { x: 0.85, y: 0.85, z: 0.85, duration: 11 }, 37);
    tl.to(sc.ringsGroup.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 10 }, 37);
    tl.to(RF, { v: 0, duration: 9 }, 38);
    tl.to(rot, { x: 0.3, y: -0.9, z: 0.1, duration: 13 }, 37);
    // F6 (50–65): exploded view
    tl.to(sc.topCap.position, { y: () => sc.CAP_Y + 0.8, duration: 10 }, 50);
    tl.to(sc.bottomCap.position, { y: () => -sc.CAP_Y - 0.8, duration: 10 }, 50);
    tl.to(sc.innerCore.scale, { y: 3.2, duration: 10 }, 50);
    tl.to(DRAW, { v: 1, duration: 10, ease: 'none', onUpdate: () => {
      const n = Math.floor(DRAW.v * sc.tubeIdx.seg) * sc.tubeIdx.rad * 6; sc.tube.geometry.setDrawRange(0, n);
    } }, 51);
    tl.to(EX, { v: 1, duration: 10 }, 50);
    tl.to(rs, { x: 0.62, y: 0.62, z: 0.62, duration: 8 }, 50);
    tl.to(rot, { x: 0.42, y: -1.05, z: 0.12, duration: 8 }, 50);
    fade('#frame-6', 52, 3, 62);
    // F7 (65–78): caps snap back, a row of coins appears
    tl.to(sc.topCap.position, { y: sc.CAP_Y, duration: 6, ease: 'power3.in' }, 65);
    tl.to(sc.bottomCap.position, { y: -sc.CAP_Y, duration: 6, ease: 'power3.in' }, 65);
    tl.to(sc.innerCore.scale, { y: 1, duration: 6, ease: 'power3.in' }, 65);
    tl.to(EX, { v: 0, duration: 6 }, 65);
    tl.to(DRAW, { v: 0.0001, duration: 6, ease: 'none', onUpdate: () => { sc.tube.geometry.setDrawRange(0, Math.floor(DRAW.v * sc.tubeIdx.seg) * sc.tubeIdx.rad * 6); } }, 65);
    tl.to(cam, { z: () => baseZ() * 0.92, y: 0.3, duration: 13 }, 65);
    tl.to(rp, { x: 0, y: 0.75, duration: 13 }, 65);
    tl.to(rs, { x: 0.85, y: 0.85, z: 0.85, duration: 8 }, 65);
    tl.to(rot, { x: 0.1, y: -0.3, z: 0, duration: 8 }, 65);
    sc.miniList.forEach((c, i) => tl.to(c.scale, { x: 1, y: 1, z: 1, duration: 5, ease: 'back.out(1.8)' }, 69 + i * 1.1));
    // F8 (78–90): camera tilts down, coin lies flat over the blueprint grid
    tl.to(sc.miniList.map(c => c.scale), { x: 0.0001, y: 0.0001, z: 0.0001, duration: 5, stagger: 0.4 }, 78);
    tl.to(cam, { y: 2.7, lookY: -0.45, z: () => baseZ() * 0.88, duration: 12 }, 78);
    tl.to(rot, { x: -1.4, y: 0, z: 0, duration: 12 }, 78);
    tl.to(rp, { y: 0.15, duration: 12 }, 78);
    tl.to(sc.grid.material, { opacity: 0.28, duration: 9 }, 78);
    tl.to(sc.terrainMat.uniforms.uOpacity, { value: 0, duration: 8 }, 78);
    tl.to(sc.terrain.position, { y: -7, duration: 12 }, 78);
    tl.to(RF, { v: 0, duration: 6 }, 78);
    // F9 (90–100): shrink + glide into the header logo, canvas hands over to the live dashboard
    tl.to(cam, { x: 0, y: 0, z: () => baseZ(), lookY: 0, duration: 10 }, 90);
    tl.to(rot, { x: 0, y: 0, z: 0, duration: 9 }, 90);
    tl.to(rp, { x: () => dockInfo().x, y: () => dockInfo().y, z: 0, duration: 10, ease: 'power3.inOut' }, 90);
    tl.to(rs, { x: () => dockInfo().s, y: () => dockInfo().s, z: () => dockInfo().s, duration: 10, ease: 'power3.inOut' }, 90);
    tl.to(sc.grid.material, { opacity: 0, duration: 4 }, 90);
    tl.to(sc.particles.material, { opacity: 0, duration: 5 }, 90);
    tl.to(sc.halo.material, { opacity: 0, duration: 6 }, 92);
    tl.to(PK, { v: 0, duration: 8, ease: 'power2.inOut' }, 90);
    tl.to('.ticker-wrap', { opacity: 1, duration: 6, ease: 'power1.out' }, 92);
    tl.to('header .logo-mark', { opacity: 1, duration: 2, ease: 'none' }, 98);
    tl.to(canvas, { opacity: 0, duration: 2, ease: 'none' }, 98);
    tl.set({}, {}, 100);                                   // pad the timeline to exactly 100 units

    // ── smooth scrolling (only while the intro lives) + ScrollTrigger sync
    run.lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    run.lenis.on('scroll', ScrollTrigger.update);

    // ── input / resize / lifecycle listeners
    const on = (t, e, f, o) => { t.addEventListener(e, f, o); run.listeners.push([t, e, f, o]); };
    on(window, 'pointermove', e => { run.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2; run.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });
    on(window, 'resize', () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); camera.aspect = aspect(); camera.updateProjectionMatrix();
      if (run.renderOn) renderer.render(scene, camera);          // setSize clears the canvas — repaint now instead of waiting a frame
    });
    on(window, 'keydown', e => { if (e.key === 'Escape') skip(); });
    on(canvas, 'webglcontextlost', e => { e.preventDefault(); finish({ seen: false }); });

    window.scrollTo(0, 0);
    ScrollTrigger.refresh();
    run.raf = requestAnimationFrame(frame);
  }

  // ─── per-frame update + render ──────────────────────────────────────────────
  function frame(now) {
    const run = S.run; if (!run) return;
    run.raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - run.last) / 1000); run.last = now;
    if (run.lenis) run.lenis.raf(now);
    if (!run.renderOn) return;
    run.t += dt;
    const { sc, mouse, P, RF, RS, EX, PK, cam } = run, t = run.t, k = PK.v;

    mouse.x += (mouse.tx - mouse.x) * 0.06; mouse.y += (mouse.ty - mouse.y) * 0.06;
    sc.parallax.position.set(k * mouse.x * 0.18, k * (-mouse.y * 0.12 + Math.sin(t * 1.1) * 0.06), 0);
    sc.parallax.rotation.set(k * mouse.y * 0.08, k * mouse.x * 0.14, k * Math.sin(t * 0.7) * 0.03);

    sc.innerCore.rotation.y = Math.sin(t * 0.7) * 0.6;   // sway, so the chart plane stays readable
    sc.rowCoins.scale.setScalar(clamp(run.canvas.clientWidth / Math.max(1, run.canvas.clientHeight) / 1.5, 0.45, 1));   // keep the coin row inside narrow screens
    sc.ringList.forEach((r, i) => {
      r.ring.rotation.z += dt * RS.speed * r.spin * (i ? 1 : 1.2);
      r.ring.material.opacity = RF.v * 0.85; r.node.material.opacity = RF.v; r.label.material.opacity = RF.v;
    });
    sc.ringsGroup.rotation.y += dt * 0.12;
    sc.terrainMat.uniforms.uTime.value = t;
    sc.lGreen.intensity = 1.5 + Math.sin(t * 1.3) * 0.2; sc.lCyan.intensity = 1.4 + Math.cos(t * 1.1) * 0.2;

    // particles + streaks
    const pos = sc.pPos, spd = P.speed, camZ = cam.z;
    for (let i = 0; i < sc.PN; i++) {
      const k = i * 3;
      pos[k + 2] += spd * sc.pRate[i] * dt;
      pos[k + 1] += Math.sin(t * 0.6 + sc.pPhase[i]) * 0.05 * dt;
      if (pos[k + 2] > camZ - 0.9) { pos[k + 2] -= 21; pos[k] = (Math.random() - 0.5) * 18; pos[k + 1] = (Math.random() - 0.5) * 10; }
    }
    sc.pGeo.attributes.position.needsUpdate = true;
    const len = spd * 0.05, sp = sc.sPos;
    for (let i = 0; i < sc.SN; i++) {
      const k = i * 3, o = i * 6;
      sp[o] = pos[k]; sp[o + 1] = pos[k + 1]; sp[o + 2] = pos[k + 2]; sp[o + 3] = pos[k]; sp[o + 4] = pos[k + 1]; sp[o + 5] = pos[k + 2] - len;
    }
    sc.sGeo.attributes.position.needsUpdate = true;
    sc.streaks.material.opacity = clamp((spd - 1.2) / 5, 0, 1) * 0.75;

    // camera (timeline-driven pose + a hint of mouse parallax)
    sc.camera.position.set(cam.x + k * mouse.x * 0.12, cam.y - k * mouse.y * 0.08, cam.z);
    sc.camera.lookAt(0, cam.lookY, 0);
    sc.renderer.render(sc.scene, sc.camera);

    // perf governor: if we can't hold ~40 fps, step the pixel ratio down toward 1
    run.ema += (dt - run.ema) * 0.05;
    if (++run.frames % 90 === 0 && run.ema > 1 / 40 && sc.renderer.getPixelRatio() > 1) {
      sc.renderer.setPixelRatio(Math.max(1, sc.renderer.getPixelRatio() - 0.25));
      sc.renderer.setSize(run.canvas.clientWidth, run.canvas.clientHeight, false);
      sc.renderer.render(sc.scene, sc.camera);                   // no blank frame when the governor steps down
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  function enterLayout() {
    document.documentElement.classList.add('intro-active');
    // the dashboard sits (hidden) under the story: keep keyboard focus out of it, otherwise Tab would make the
    // browser scroll to a focused dashboard control and skip/break the story
    const app = $('appWrapper'); if (app) app.setAttribute('inert', '');
    S.prevRestoration = history.scrollRestoration;
    S.prevScrollBehavior = document.documentElement.style.scrollBehavior;
    try { history.scrollRestoration = 'manual'; } catch (_) { /* old browsers */ }
    window.scrollTo(0, 0);
  }

  async function prepare() {
    if (S.phase !== 'idle') return;                        // showApp() runs on every auth event — only act once
    if (!shouldPlay()) { S.phase = 'done'; return; }
    S.phase = 'loading'; S.finishing = false;
    enterLayout();
    try {
      await loadLibs();
      if (S.phase !== 'loading') return;                   // skipped / logged out while downloading
      start();
      S.phase = 'active';
    } catch (err) {
      console.warn('[intro] skipped —', err && err.message);
      if (S.phase === 'loading') finish({ seen: false, instant: true });   // CDN blocked etc.: no flag, retry next time
    }
  }

  function skipToDashboard() { skip(); }
  function skip() {
    if (S.phase === 'loading') { finish({ seen: true, instant: true }); return; }
    if (S.phase !== 'active' || S.finishing) return;
    const run = S.run, target = run.container.offsetTop + run.container.offsetHeight - run.canvas.clientHeight;
    if (run.lenis) {
      run.lenis.scrollTo(target + 2, { duration: 1.4, easing: easeInOutCubic, lock: true, force: true, onComplete: () => finish({ seen: true }) });
    } else { window.scrollTo(0, target + 2); finish({ seen: true }); }
  }

  function finish(opts) {
    const { seen = true, instant = false } = opts || {};
    if (S.phase === 'done' || S.finishing) return;
    S.finishing = true;
    if (seen) markSeen();
    const run = S.run;
    if (!instant && run && window.gsap) {                  // the timeline lags the scroll a little: fade whatever is left
      gsap.to([run.canvas, '.scrolly-sections', '.scrolly-bg'], { opacity: 0, duration: 0.25, overwrite: 'auto', onComplete: () => cleanup('done') });
    } else cleanup('done');
  }

  function teardown() {                                    // logout while the intro is unfinished
    if (S.phase === 'done' || S.phase === 'idle') return;
    S.finishing = true; cleanup('idle');
  }

  function cleanup(nextPhase) {
    const run = S.run, html = document.documentElement;
    const header = document.querySelector('header .logo-mark') || document.querySelector('header');
    const before = header ? header.getBoundingClientRect().top : 0;

    if (run) {
      cancelAnimationFrame(run.raf);
      run.listeners.forEach(([t, e, f, o]) => t.removeEventListener(e, f, o));
      if (run.lenis) {
        const L = run.lenis;
        // Lenis 1.1.18 leaves a velocity-reset timer running after destroy(); when it fires it re-adds html.lenis.
        // Neutralise class writes first, then destroy, then clear that timer.
        L.updateClassName = () => {};
        try { L.destroy(); } catch (e) { console.warn('[intro] lenis.destroy failed:', e); }
        clearTimeout(L._resetVelocityTimeout);
        document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-scrolling', 'lenis-stopped');
      }
      if (run.tl) { if (run.st) run.st.kill(); run.tl.kill(); }
      if (window.gsap) gsap.killTweensOf([run.canvas, '.scrolly-sections', '.scrolly-bg']);
      if (run.sc) disposeScene(run.sc);
    }
    if (window.gsap) gsap.set(['.ticker-wrap', 'header .logo-mark'], { clearProps: 'opacity' });

    // swap in a fresh canvas — a context we force-lost can never be reused
    const old = $('webgl-canvas');
    if (old) { const fresh = old.cloneNode(false); fresh.removeAttribute('style'); old.replaceWith(fresh); }
    ['.scrolly-sections', '.scrolly-bg'].forEach(sel => { const el = document.querySelector(sel); if (el) el.removeAttribute('style'); });
    document.querySelectorAll('.scrolly-frame').forEach(el => el.removeAttribute('style'));
    const bar = $('scrolly-progress'); if (bar) bar.style.transform = '';

    // remove the intro and keep the dashboard exactly where the user sees it (no visible jump)
    const root = document.documentElement;
    root.style.scrollBehavior = 'auto';
    html.classList.remove('intro-active');
    const appEl = $('appWrapper'); if (appEl) appEl.removeAttribute('inert');
    if (header) { const after = header.getBoundingClientRect().top; if (nextPhase === 'done') window.scrollTo(0, Math.max(0, window.scrollY + (after - before))); }
    if (nextPhase !== 'done') window.scrollTo(0, 0);
    root.style.scrollBehavior = S.prevScrollBehavior || '';          // '' removes our/ScrollTrigger's inline value
    try { history.scrollRestoration = S.prevRestoration || 'auto'; } catch (_) { /* noop */ }

    S.run = null; S.phase = nextPhase; S.finishing = false;
  }

  function disposeScene(sc) {
    const texKeys = ['map', 'emissiveMap', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap'];
    sc.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach(m => { texKeys.forEach(k => { if (m[k]) m[k].dispose(); }); m.dispose(); });
    });
    if (sc.envRT) sc.envRT.dispose();
    sc.renderer.dispose();
    try { sc.renderer.forceContextLoss(); } catch (_) { /* noop */ }
  }

  window.ScrollyIntro = { prepare, teardown, skip, state: S };
  window.skipToDashboard = skipToDashboard;
})();
