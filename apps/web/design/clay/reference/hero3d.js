// noti.school Clay hero: one plinth, one bookstack per university. Only the reader's school is in colour,
// other schools sit behind a lock, and an empty slot waits for the next university.
// intent: show per-school scope (each account answers only from its own school's approved sources)
//         and evidence (the pin marks the cited line) in one product-meaningful scene
// status: done (mockup)
// next: port to apps/web as a lazily imported Solid island (dynamic import('three') once visible + idle)
// confidence: high
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const host = document.getElementById('stage3d');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clay = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .78, metalness: 0, sheen: .35, sheenRoughness: .8, sheenColor: 0xffffff, ...o });
const COLOR = { a: [0xb4532c, 0x7f9a8b, 0xd8c4a6], grey: [0xc9cec6, 0xbfc5bd, 0xd6d9d3], ghost: [0xe2e5df, 0xe2e5df, 0xe2e5df], next: [0x7f9a8b, 0xa9bdb1, 0xd8c4a6] };

function textSprite(text, { bg = null, fg = '#1e2529', size = 64, pad = 22, font = 'Hanken Grotesk' } = {}) {
  const c = document.createElement('canvas'), x = c.getContext('2d');
  x.font = `700 ${size}px "${font}", system-ui, sans-serif`;
  const w = Math.ceil(x.measureText(text).width) + pad * 2, h = size + pad * 1.6;
  c.width = w; c.height = h;
  x.font = `700 ${size}px "${font}", system-ui, sans-serif`;
  if (bg) { x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, w, h, h / 2); x.fill(); }
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + size * .06);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
  s.renderOrder = 10; s.scale.set(w / h * .32, .32, 1);
  return s;
}

function start() {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch { return; } // static fallback stays visible
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc4cbc2, 1.25));
  const key = new THREE.DirectionalLight(0xfff3e8, 2.5);
  key.position.set(4, 9, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = .02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, .6); rim.position.set(-6, 3, -5); scene.add(rim);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: .14 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.32; ground.receiveShadow = true; scene.add(ground);

  const world = new THREE.Group(); scene.add(world);
  const cast = m => { m.castShadow = true; m.receiveShadow = true; return m; };

  // --- plinth with grooves between schools (scope boundaries)
  const plinth = cast(new THREE.Mesh(new RoundedBoxGeometry(8.6, .3, 3.4, 4, .12), clay(0xeceee9, { sheen: .2 })));
  plinth.position.y = -.15; world.add(plinth);
  for (const gx of [-1.45, 1.45]) {
    const g = new THREE.Mesh(new RoundedBoxGeometry(.06, .04, 3.1, 2, .02), clay(0xc9cec6)); g.position.set(gx, .01, 0); world.add(g);
  }

  // --- one stack per school
  const pagesMat = clay(0xf7f3ea, { sheen: .1 });
  const makeStack = (palette, opts = {}) => {
    const g = new THREE.Group(), mats = [];
    [{ w: 1.9, d: 1.45, h: .3, y: .15, r: -.06 }, { w: 1.75, d: 1.35, h: .27, y: .44, r: .1 }, { w: 1.6, d: 1.28, h: .25, y: .7, r: -.03 }].forEach((b, i) => {
      const m = clay(palette[i], opts.mat); mats.push(m);
      const book = new THREE.Group();
      book.add(cast(new THREE.Mesh(new RoundedBoxGeometry(b.w, b.h, b.d, 4, .06), m)));
      if (!opts.ghost) { const p = cast(new THREE.Mesh(new RoundedBoxGeometry(b.w - .07, b.h - .08, b.d - .12, 2, .025), pagesMat)); p.position.x = .06; book.add(p); }
      book.position.y = b.y; book.rotation.y = b.r; g.add(book);
    });
    return { g, mats };
  };
  const schools = {
    other: { ...makeStack(COLOR.grey), x: -2.9 },
    hcmiu: { ...makeStack(COLOR.a), x: 0 },
    next: { ...makeStack([0xe2e5df, 0xe2e5df, 0xe2e5df], { ghost: true, mat: { transparent: true, opacity: .5 } }), x: 2.9 },
  };
  for (const s of Object.values(schools)) { s.g.position.set(s.x, 0, -.35); world.add(s.g); s.lift = 0; s.target = 0; }

  // padlock on another school: you cannot read another university's sources
  const lock = new THREE.Group();
  lock.add(cast(new THREE.Mesh(new RoundedBoxGeometry(.42, .34, .2, 3, .06), clay(0x56616a))));
  const shackle = cast(new THREE.Mesh(new THREE.TorusGeometry(.13, .04, 16, 32, Math.PI), clay(0x8a949b)));
  shackle.position.y = .17; lock.add(shackle);
  lock.position.set(-2.9, 1.25, -.35); world.add(lock);

  const lblHome = textSprite('HCMIU · pilot', { bg: '#ffffff', size: 54 }); lblHome.position.set(0, 1.55, -.35); world.add(lblHome);
  const plus = textSprite('+', { bg: '#a8431f', fg: '#ffffff', size: 70, pad: 18 }); plus.scale.multiplyScalar(1.5); plus.position.set(2.9, 1.2, -.35); world.add(plus);

  // --- open page in front of the reader's school, with evidence lines and the citation pin
  const page = new THREE.Group();
  page.add(cast(new THREE.Mesh(new RoundedBoxGeometry(1.7, .06, 2.15, 3, .03), clay(0xffffff, { sheen: .15 }))));
  const lineMat = clay(0xd3d8d1, { sheen: 0 });
  const widths = [1.2, 1.32, .98, 1.28, 1.18, 1.32, .74, 1.2];
  const lineZ = i => -.82 + i * .23;
  widths.forEach((w, i) => { const l = new THREE.Mesh(new RoundedBoxGeometry(w, .022, .06, 2, .01), lineMat); l.position.set(-.64 + w / 2, .042, lineZ(i)); page.add(l); });
  const evidence = { a: 3, b: 5 }, hl = {};
  for (const [id, i] of Object.entries(evidence)) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(widths[i] + .12, .018, .15, 2, .008), new THREE.MeshStandardMaterial({ color: 0xf2c48d, roughness: 1, transparent: true, opacity: 0 }));
    m.position.set(-.64 + widths[i] / 2, .036, lineZ(i)); page.add(m); hl[id] = m;
  }
  page.position.set(.35, .5, 1.45); page.rotation.set(.42, -.18, -.06);
  world.add(page);

  const numTex = n => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.font = '700 84px "Bricolage Grotesque", system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const tex = { a: numTex(1), b: numTex(2) };
  const pin = new THREE.Group();
  const head = cast(new THREE.Mesh(new THREE.SphereGeometry(.24, 48, 32), clay(0xa8431f))); head.position.y = .64; pin.add(head);
  const face = new THREE.SpriteMaterial({ map: tex.a, depthTest: false, transparent: true });
  const num = new THREE.Sprite(face); num.scale.setScalar(.34); num.position.y = .64; num.renderOrder = 11; pin.add(num);
  const stem = cast(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .5, 16), clay(0x8f3818))); stem.position.y = .28; pin.add(stem);
  const tip = cast(new THREE.Mesh(new THREE.SphereGeometry(.055, 24, 16), clay(0x8f3818))); tip.position.y = .03; pin.add(tip);
  page.add(pin);


  // --- state
  let active = 'a', scope = document.getElementById('scope-btn')?.dataset.scope || 'hcmiu';
  const pinTarget = new THREE.Vector3();
  const placePin = (id, snap) => { const i = evidence[id]; pinTarget.set(-.64 + widths[i] * .62, .04, lineZ(i)); if (snap) pin.position.copy(pinTarget); face.map = tex[id]; face.needsUpdate = true; };
  placePin(active, true); hl.a.material.opacity = 1;
  const tmp = new THREE.Color();
  const applyScope = snap => {
    for (const [id, s] of Object.entries(schools)) {
      s.target = id === scope ? .22 : 0;
      if (id === 'hcmiu') s.palette = scope === 'hcmiu' ? COLOR.a : COLOR.grey;
      if (id === 'next') { s.palette = scope === 'next' ? COLOR.next : COLOR.ghost; s.opTarget = scope === 'next' ? .95 : .5; }
      if (snap) { s.lift = s.target; if (s.palette) s.mats.forEach((m, i) => m.color.setHex(s.palette[i])); if (s.opTarget != null) s.mats.forEach(m => (m.opacity = s.opTarget)); }
    }
    page.visible = scope === 'hcmiu';
  };
  applyScope(true);

  // --- framing: auto-fit the scene and shift it up so the answer card can overlap the lower edge
  const box = new THREE.Box3().setFromObject(world);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  const view = new THREE.Vector3(.3, .7, 1).normalize();
  let running = false;
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const half = THREE.MathUtils.degToRad(camera.fov / 2);
    const fit = radius / Math.sin(Math.min(half, Math.atan(Math.tan(half) * camera.aspect)));
    camera.position.copy(center).addScaledVector(view, fit * .66);
    camera.lookAt(center);
    camera.setViewOffset(width, height, 0, height * (width < 520 ? .1 : .13), width, height);
    camera.updateProjectionMatrix();
    if (!running) renderer.render(scene, camera);
  };
  new ResizeObserver(resize).observe(host);

  const pointer = new THREE.Vector2();
  host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); pointer.set((e.clientX - r.left) / r.width * 2 - 1, (e.clientY - r.top) / r.height * 2 - 1); });
  host.addEventListener('pointerleave', () => pointer.set(0, 0));

  const clock = new THREE.Clock(); let visible = true, raf = 0;
  const step = (t, ease) => {
    for (const s of Object.values(schools)) {
      s.lift += (s.target - s.lift) * ease; s.g.position.y = s.lift;
      if (s.palette) s.mats.forEach((m, i) => m.color.lerp(tmp.setHex(s.palette[i]), ease));
      if (s.opTarget != null) s.mats.forEach(m => (m.opacity += (s.opTarget - m.opacity) * ease));
    }
    lblHome.position.y = 1.55 + schools.hcmiu.lift;
    plus.position.y = 1.2 + schools.next.lift + Math.sin(t * 1.6) * .05;
    pin.position.lerp(pinTarget, ease); pin.position.y = pinTarget.y + Math.abs(Math.sin(t * 2.2)) * .05;
    for (const id in hl) { const m = hl[id].material; m.opacity += ((id === active ? 1 : 0) - m.opacity) * ease; }
  };
  const frame = () => {
    const t = clock.getElapsedTime();
    world.rotation.y += ((pointer.x * .16 + Math.sin(t * .25) * .04) - world.rotation.y) * .06;
    world.rotation.x += ((pointer.y * .05) - world.rotation.x) * .06;
    step(t, .1);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  const play = () => { if (running || reduce || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(frame); };
  const pause = () => { running = false; cancelAnimationFrame(raf); };
  const still = () => { if (reduce) { step(0, 1); renderer.render(scene, camera); } };

  addEventListener('noti:cite', e => { active = e.detail; placePin(active, reduce); still(); });
  addEventListener('noti:scope', e => { scope = e.detail; applyScope(reduce); still(); });
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible ? play() : pause(); }).observe(host);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));

  resize(); renderer.render(scene, camera);
  requestAnimationFrame(() => host.classList.add('ready'));
  play();
}

const boot = () => (document.fonts?.ready ?? Promise.resolve()).then(start);
'requestIdleCallback' in window ? requestIdleCallback(boot, { timeout: 1200 }) : setTimeout(boot, 200);
