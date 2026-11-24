/* ════════════════════════════════════════════════════════════════════════════
   TrackTrade — 3D cinematic scrollytelling intro  (Sprint 3)

   Flow:  login → showApp() → ScrollyIntro.prepare()
            ├─ not first visit / reduced motion / data-saver / no WebGL → dashboard as usual
            └─ otherwise: lazy-load three · gsap · ScrollTrigger · Lenis, build the scene,
               play the 9-frame story on scroll, dock the cyber delta into the header logo,
               then remove the whole intro (DOM, listeners, GPU memory) and hand the page back.

   Cyber Delta Prism (▲): Procedural 3D emerald glass prism with neon edge bevels.
   Zero external model/texture files, zero heavy CPU 2D canvas loops.
   Replay any time with  ?intro=1
   ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const SEEN_KEY = 'tt_intro_seen_v1';
  const LIBS = {
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
    if (navigator.connection && navigator.connection.saveData) return false;  // data-saver
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
  //  LIGHTWEIGHT PROCEDURAL TEXTURES (halo glow & badge labels only)
  // ═══════════════════════════════════════════════════════════════════════════
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; };

  function glowSpriteTexture(inner, outer) {
    const c = mkCanvas(256), g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, inner); gr.addColorStop(0.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  function labelTexture(text, color) {
    const c = mkCanvas(256, 96), g = c.getContext('2d');
    g.font = '800 56px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color; g.fillText(text, 128, 50);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }

  // Equilateral triangle shape centered at its centroid (0,0)
  function createTriangleShape(s = 2.0) {
    const h = (s * Math.sqrt(3)) / 2;
    const yTop = (2 / 3) * h;
    const yBot = -(1 / 3) * h;
    const xHalf = s / 2;
    const shape = new THREE.Shape();
    shape.moveTo(0, yTop);
    shape.lineTo(xHalf, yBot);
    shape.lineTo(-xHalf, yBot);
    shape.closePath();
    return shape;
  }

  // soft studio environment so the glass/crystal facets catch highlights
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    const envRT = buildEnvironment(renderer); scene.environment = envRT.texture;

    // lights: ambient + two vivid accent point lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const lGreen = new THREE.PointLight(COL.green, 1.6, 22); lGreen.position.set(4, 2.5, 5); scene.add(lGreen);
    const lCyan = new THREE.PointLight(COL.cyan, 1.4, 22);  lCyan.position.set(-4, -2, 4); scene.add(lCyan);

    // ── hierarchy: rig (timeline: position/scale) → parallax (mouse + idle) → coinGroup (timeline: rotation)
    const rig = new THREE.Group(), parallax = new THREE.Group(), coinGroup = new THREE.Group(), coinBody = new THREE.Group();
    scene.add(rig); rig.add(parallax); parallax.add(coinGroup); coinGroup.add(coinBody);

    const neon = (hex) => new THREE.MeshBasicMaterial({ color: hex, toneMapped: false });
    const edgeMat = new THREE.LineBasicMaterial({ color: COL.green, linewidth: 2, toneMapped: false });

    // ── Materials: Cyber Emerald / Dark Luxury Glass
    const matTriangle = new THREE.MeshPhysicalMaterial({
      color: 0x0a2318,
      emissive: 0x22c55e,
      emissiveIntensity: 0.55,
      roughness: 0.12,
      metalness: 0.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transmission: 0.45,
      transparent: true,
      opacity: 0.94,
      reflectivity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: true,
    });

    const matBackTriangle = new THREE.MeshPhysicalMaterial({
      color: 0x051b11,
      emissive: 0x16a34a,
      emissiveIntensity: 0.38,
      roughness: 0.18,
      metalness: 0.45,
      clearcoat: 0.8,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    });

    // ── Cyber Delta Prism Geometry (▲)
    const TRI_S = 2.2;
    const CAP_Z = 0.14;

    function makeTriangleCap(sign, mat) {
      const g = new THREE.Group();
      const shape = createTriangleShape(TRI_S);
      const extrudeSettings = {
        depth: 0.12,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.045,
        bevelThickness: 0.045,
      };
      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.center();
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 22), edgeMat);
      g.add(mesh, edges);
      g.position.z = sign * CAP_Z;
      return g;
    }

    const topCap = makeTriangleCap(1, matTriangle);       // front face
    const bottomCap = makeTriangleCap(-1, matBackTriangle); // back face

    // ── Inner core: holographic equity curve + wireframe grid inside delta
    const innerCore = new THREE.Group();
    const innerTriShape = createTriangleShape(TRI_S * 0.80);
    const innerTriGeo = new THREE.ExtrudeGeometry(innerTriShape, { depth: 0.08, bevelEnabled: false, steps: 1 });
    innerTriGeo.center();
    innerCore.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(innerTriGeo),
      new THREE.LineBasicMaterial({ color: COL.green, transparent: true, opacity: 0.35, toneMapped: false })
    ));

    const rng = mulberry32(42), pts = []; let v = -0.28;
    for (let i = 0; i < 40; i++) {
      const x = ((i / 39) - 0.5) * 1.15;
      v = clamp(v + 0.022 + (rng() - 0.41) * 0.07, -0.42, 0.45);
      pts.push(new THREE.Vector3(x, v, (rng() - 0.5) * 0.04));
    }
    const curve = new THREE.CatmullRomCurve3(pts), TUBE_SEG = 160, TUBE_RAD = 6;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, TUBE_SEG, 0.014, TUBE_RAD, false), neon(COL.lime));
    const idxCount = tube.geometry.index.count; tube.geometry.setDrawRange(0, 0);
    innerCore.add(tube);

    const gridMat = new THREE.LineBasicMaterial({ color: COL.cyan, transparent: true, opacity: 0.25, toneMapped: false });
    const gl = []; [-0.25, 0, 0.25].forEach(y => gl.push(-0.55, y, 0, 0.55, y, 0));
    const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
    innerCore.add(new THREE.LineSegments(gridGeo, gridMat));

    const dotGeo = new THREE.SphereGeometry(0.035, 12, 10), dot = new THREE.Mesh(dotGeo, neon(0xffffff));
    dot.position.copy(pts[pts.length - 1]);
    innerCore.add(dot);

    coinBody.add(innerCore, topCap, bottomCap);

    // ── soft halo behind the delta (emerald/cyan glow)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture('rgba(60,255,160,0.55)', 'rgba(56,189,248,0.16)'),
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55
    }));
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

    // ── row of mini delta triangles (frame 7: "ONE SYSTEM. EVERY PORTFOLIO.")
    const rowCoins = new THREE.Group(); scene.add(rowCoins);
    const miniShape = createTriangleShape(0.7);
    const miniGeo = new THREE.ExtrudeGeometry(miniShape, { depth: 0.08, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.02, bevelThickness: 0.02 });
    miniGeo.center();
    const miniEdgeGeo = new THREE.EdgesGeometry(miniGeo, 22);
    const miniList = [];
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Group();
      c.add(new THREE.Mesh(miniGeo, matTriangle), new THREE.LineSegments(miniEdgeGeo, edgeMat));
      c.position.set((i - 2) * 1.15, -1.35 + Math.sin(i * 1.7) * 0.08, 0.2);
      c.rotation.set(0.15, (i - 2) * -0.12, 0);
      c.scale.setScalar(0.0001);
      rowCoins.add(c);
      miniList.push(c);
    }

    return {
      renderer, scene, camera, envRT, rig, parallax, coinGroup, topCap, bottomCap, innerCore, tube,
      tubeIdx: { count: idxCount, seg: TUBE_SEG, rad: TUBE_RAD },
      ringsGroup, ringList, terrain, terrainMat, grid, particles, pGeo, pPos, pPhase, pRate, PN,
      streaks, sGeo, sPos, SN, rowCoins, miniList, halo, matGlass: matTriangle, lGreen, lCyan,
      CAP_Z, CAP_Y: CAP_Z, TRI_S
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

    // portrait screens: pull the camera back and shrink lateral offsets so delta never leaves the frame
    const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const baseZ  = () => 6 * clamp(1.15 / Math.max(aspect(), 0.1), 1, 1.7);
    const kx     = () => clamp(aspect() / 1.5, 0.35, 1);

    // where the header logo sits when scrolling ends, in world space at delta depth
    function dockInfo() {
      const logo = document.querySelector('header .logo-mark'); if (!logo) return { x: 0, y: 2, s: 0.12 };
      const finalScroll = container.offsetTop + container.offsetHeight - canvas.clientHeight;
      const r = logo.getBoundingClientRect(), gc = glyphCenter(logo, r), cx = gc.x + window.scrollX, cy = gc.y + window.scrollY - finalScroll;
      const dc = new THREE.PerspectiveCamera(camera.fov, aspect(), 0.1, 100); dc.position.set(0, 0, baseZ()); dc.lookAt(0, 0, 0);
      dc.updateMatrixWorld(true); dc.updateProjectionMatrix();
      const ndc = new THREE.Vector3((cx / canvas.clientWidth) * 2 - 1, -(cy / canvas.clientHeight) * 2 + 1, 0.5).unproject(dc);
      const dir = ndc.sub(dc.position).normalize(), t = -dc.position.z / dir.z, w = dc.position.clone().add(dir.multiplyScalar(t));
      const upx = (2 * Math.tan(THREE.MathUtils.degToRad(dc.fov / 2)) * dc.position.z) / canvas.clientHeight;
      const triH = (sc.TRI_S * Math.sqrt(3)) / 2;
      const s = (Math.max(r.width, r.height) * upx) / triH;
      return { x: w.x, y: w.y, s };
    }

    // ── initial pose
    cam.z = baseZ();
    sc.rig.position.set(0, 0.55, 0);

    // ── the 9-frame timeline (positions are in percent of the scroll range)
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
    const fade = (sel, at, dur = 3, out = at + 9) => {
      tl.fromTo(sel, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: dur, ease: 'power2.out' }, at);
      tl.to(sel, { autoAlpha: 0, y: -28, duration: dur, ease: 'power2.in' }, out);
    };

    // F1→2 (0–12): tilt [0,0,0] → [0.2,-0.6,0.1]; hero text leaves
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

    // F6 (50–65): exploded view — triangle plates split, revealing inner 3D equity curve
    tl.to(sc.topCap.position, { z: () => sc.CAP_Z + 0.85, duration: 10 }, 50);
    tl.to(sc.bottomCap.position, { z: () => -sc.CAP_Z - 0.85, duration: 10 }, 50);
    tl.to(sc.innerCore.scale, { z: 3.2, duration: 10 }, 50);
    tl.to(DRAW, { v: 1, duration: 10, ease: 'none', onUpdate: () => {
      const n = Math.floor(DRAW.v * sc.tubeIdx.seg) * sc.tubeIdx.rad * 6; sc.tube.geometry.setDrawRange(0, n);
    } }, 51);
    tl.to(EX, { v: 1, duration: 10 }, 50);
    tl.to(rs, { x: 0.62, y: 0.62, z: 0.62, duration: 8 }, 50);
    tl.to(rot, { x: 0.42, y: -1.05, z: 0.12, duration: 8 }, 50);
    fade('#frame-6', 52, 3, 62);

    // F7 (65–78): plates snap back, row of mini deltas appear
    tl.to(sc.topCap.position, { z: sc.CAP_Z, duration: 6, ease: 'power3.in' }, 65);
    tl.to(sc.bottomCap.position, { z: -sc.CAP_Z, duration: 6, ease: 'power3.in' }, 65);
    tl.to(sc.innerCore.scale, { z: 1, duration: 6, ease: 'power3.in' }, 65);
    tl.to(EX, { v: 0, duration: 6 }, 65);
    tl.to(DRAW, { v: 0.0001, duration: 6, ease: 'none', onUpdate: () => { sc.tube.geometry.setDrawRange(0, Math.floor(DRAW.v * sc.tubeIdx.seg) * sc.tubeIdx.rad * 6); } }, 65);
    tl.to(cam, { z: () => baseZ() * 0.92, y: 0.3, duration: 13 }, 65);
    tl.to(rp, { x: 0, y: 0.75, duration: 13 }, 65);
    tl.to(rs, { x: 0.85, y: 0.85, z: 0.85, duration: 8 }, 65);
    tl.to(rot, { x: 0.1, y: -0.3, z: 0, duration: 8 }, 65);
    sc.miniList.forEach((c, i) => tl.to(c.scale, { x: 1, y: 1, z: 1, duration: 5, ease: 'back.out(1.8)' }, 69 + i * 1.1));

    // F8 (78–90): camera tilts down, delta lies flat over the blueprint grid
    tl.to(sc.miniList.map(c => c.scale), { x: 0.0001, y: 0.0001, z: 0.0001, duration: 5, stagger: 0.4 }, 78);
    tl.to(cam, { y: 2.7, lookY: -0.45, z: () => baseZ() * 0.88, duration: 12 }, 78);
    tl.to(rot, { x: -1.4, y: 0, z: 0, duration: 12 }, 78);
    tl.to(rp, { y: 0.15, duration: 12 }, 78);
    tl.to(sc.grid.material, { opacity: 0.28, duration: 9 }, 78);
    tl.to(sc.terrainMat.uniforms.uOpacity, { value: 0, duration: 8 }, 78);
    tl.to(sc.terrain.position, { y: -7, duration: 12 }, 78);
    tl.to(RF, { v: 0, duration: 6 }, 78);

    // F9 (90–100): shrink + dock perfectly into header ▲ logo, canvas hands over to live dashboard
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
    tl.set({}, {}, 100);

    // ── smooth scrolling
    run.lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    run.lenis.on('scroll', ScrollTrigger.update);

    // ── input / resize / lifecycle listeners
    const on = (t, e, f, o) => { t.addEventListener(e, f, o); run.listeners.push([t, e, f, o]); };
    on(window, 'pointermove', e => { run.mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2; run.mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });
    on(window, 'resize', () => {
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false); camera.aspect = aspect(); camera.updateProjectionMatrix();
      if (run.renderOn) renderer.render(scene, camera);
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

    sc.innerCore.rotation.y = Math.sin(t * 0.7) * 0.22;
    sc.rowCoins.scale.setScalar(clamp(run.canvas.clientWidth / Math.max(1, run.canvas.clientHeight) / 1.5, 0.45, 1));
    sc.ringList.forEach((r, i) => {
      r.ring.rotation.z += dt * RS.speed * r.spin * (i ? 1 : 1.2);
      r.ring.material.opacity = RF.v * 0.85; r.node.material.opacity = RF.v; r.label.material.opacity = RF.v;
    });
    sc.ringsGroup.rotation.y += dt * 0.12;
    sc.terrainMat.uniforms.uTime.value = t;
    sc.lGreen.intensity = 1.6 + Math.sin(t * 1.3) * 0.2; sc.lCyan.intensity = 1.4 + Math.cos(t * 1.1) * 0.2;

    // particles + streaks
    const pos = sc.pPos, spd = P.speed, camZ = cam.z;
    for (let i = 0; i < sc.PN; i++) {
      const idx = i * 3;
      pos[idx + 2] += spd * sc.pRate[i] * dt;
      pos[idx + 1] += Math.sin(t * 0.6 + sc.pPhase[i]) * 0.05 * dt;
      if (pos[idx + 2] > camZ - 0.9) { pos[idx + 2] -= 21; pos[idx] = (Math.random() - 0.5) * 18; pos[idx + 1] = (Math.random() - 0.5) * 10; }
    }
    sc.pGeo.attributes.position.needsUpdate = true;
    const len = spd * 0.05, sp = sc.sPos;
    for (let i = 0; i < sc.SN; i++) {
      const idx = i * 3, o = i * 6;
      sp[o] = pos[idx]; sp[o + 1] = pos[idx + 1]; sp[o + 2] = pos[idx + 2]; sp[o + 3] = pos[idx]; sp[o + 4] = pos[idx + 1]; sp[o + 5] = pos[idx + 2] - len;
    }
    sc.sGeo.attributes.position.needsUpdate = true;
    sc.streaks.material.opacity = clamp((spd - 1.2) / 5, 0, 1) * 0.75;

    // camera
    sc.camera.position.set(cam.x + k * mouse.x * 0.12, cam.y - k * mouse.y * 0.08, cam.z);
    sc.camera.lookAt(0, cam.lookY, 0);
    sc.renderer.render(sc.scene, sc.camera);

    // perf governor
    run.ema += (dt - run.ema) * 0.05;
    if (++run.frames % 90 === 0 && run.ema > 1 / 40 && sc.renderer.getPixelRatio() > 1) {
      sc.renderer.setPixelRatio(Math.max(1, sc.renderer.getPixelRatio() - 0.25));
      sc.renderer.setSize(run.canvas.clientWidth, run.canvas.clientHeight, false);
      sc.renderer.render(sc.scene, sc.camera);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════
  function enterLayout() {
    document.documentElement.classList.add('intro-active');
    const app = $('appWrapper'); if (app) app.setAttribute('inert', '');
    S.prevRestoration = history.scrollRestoration;
    S.prevScrollBehavior = document.documentElement.style.scrollBehavior;
    try { history.scrollRestoration = 'manual'; } catch (_) { /* old browsers */ }
    window.scrollTo(0, 0);
  }

  async function prepare() {
    if (S.phase !== 'idle') return;
    if (!shouldPlay()) { S.phase = 'done'; return; }
    S.phase = 'loading'; S.finishing = false;
    enterLayout();
    try {
      await loadLibs();
      if (S.phase !== 'loading') return;
      start();
      S.phase = 'active';
    } catch (err) {
      console.warn('[intro] skipped —', err && err.message);
      if (S.phase === 'loading') finish({ seen: false, instant: true });
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
    if (!instant && run && window.gsap) {
      gsap.to([run.canvas, '.scrolly-sections', '.scrolly-bg'], { opacity: 0, duration: 0.25, overwrite: 'auto', onComplete: () => cleanup('done') });
    } else cleanup('done');
  }

  function teardown() {
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

    const old = $('webgl-canvas');
    if (old) { const fresh = old.cloneNode(false); fresh.removeAttribute('style'); old.replaceWith(fresh); }
    ['.scrolly-sections', '.scrolly-bg'].forEach(sel => { const el = document.querySelector(sel); if (el) el.removeAttribute('style'); });
    document.querySelectorAll('.scrolly-frame').forEach(el => el.removeAttribute('style'));
    const bar = $('scrolly-progress'); if (bar) bar.style.transform = '';

    const root = document.documentElement;
    root.style.scrollBehavior = 'auto';
    html.classList.remove('intro-active');
    const appEl = $('appWrapper'); if (appEl) appEl.removeAttribute('inert');
    if (header) { const after = header.getBoundingClientRect().top; if (nextPhase === 'done') window.scrollTo(0, Math.max(0, window.scrollY + (after - before))); }
    if (nextPhase !== 'done') window.scrollTo(0, 0);
    root.style.scrollBehavior = S.prevScrollBehavior || '';
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
