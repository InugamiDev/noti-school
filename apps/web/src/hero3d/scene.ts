// intent: Clay hero scene, one plinth with a bookstack per school; ported from design/clay/reference/hero3d.js.
//         Only the reader's school is in colour, another sits behind a padlock, and an empty slot waits for the next one.
// status: done
// next: ClayHero.tsx is the only importer; keep this module behind its dynamic import so three.js stays out of the entry chunk.
// confidence: high for parity with the reference; visual check still needs a real browser with WebGL.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  CAMERA_DISTANCE_SCALE, CAMERA_FOV, EVIDENCE_LINE, GROOVE_X, LINE_WIDTHS, PALETTE, SLOT_X, STACK_Z, VIEW_DIRECTION,
  approach, capPixelRatio, fitDistance, lineCenter, lineZ, normalisedPointer, pinTarget, scopeLayout, viewOffsetY, worldRotationTarget,
  type Citation, type HeroScope, type Palette, type SlotId,
} from './layout';

export type SceneState = { activeCitation: Citation; scope: HeroScope; schoolLabel: string };
export type SceneOptions = SceneState & { reducedMotion: boolean; onReady?: () => void; onLost?: () => void };
export type SceneHandle = {
  setCitation(citation: Citation): void;
  setScope(scope: HeroScope): void;
  setLabel(label: string): void;
  dispose(): void;
};

const LABEL_FONT = '"Hanken Grotesk", system-ui, sans-serif';
const NUMERAL_FONT = '"Bricolage Grotesque Variable", "Bricolage Grotesque", system-ui, sans-serif';

/** Canvas text only uses a web font once it has loaded, so request both faces and wait for the font set. */
export async function canvasFontsReady(): Promise<void> {
  const fonts = document.fonts as FontFaceSet | undefined;
  if (!fonts) return;
  await Promise.allSettled([fonts.load(`700 54px ${LABEL_FONT}`), fonts.load(`700 84px ${NUMERAL_FONT}`)]);
  await fonts.ready;
}

const clay = (color: number, options: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.78, metalness: 0, sheen: 0.35, sheenRoughness: 0.8, sheenColor: 0xffffff, ...options });

function canvas2d(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Clay hero: 2D canvas context unavailable for sprite text');
  return { canvas, context };
}

function labelTexture(text: string, { bg, fg = '#1e2529', size = 64, pad = 22 }: { bg?: string; fg?: string; size?: number; pad?: number }) {
  const font = `700 ${size}px ${LABEL_FONT}`;
  const probe = canvas2d(1, 1).context;
  probe.font = font;
  const width = Math.ceil(probe.measureText(text).width) + pad * 2;
  const height = Math.round(size + pad * 1.6);
  const { canvas, context } = canvas2d(width, height);
  context.font = font;
  if (bg) {
    context.fillStyle = bg;
    context.beginPath();
    context.roundRect(0, 0, width, height, height / 2);
    context.fill();
  }
  context.fillStyle = fg;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2 + size * 0.06);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: width / height };
}

function numeralTexture(n: number) {
  const { canvas, context } = canvas2d(128, 128);
  context.fillStyle = '#ffffff';
  context.font = `700 84px ${NUMERAL_FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(n), 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Camera-facing text sprite; height is fixed at 0.32 world units so labels share a cap height. */
function textSprite(text: string, style: Parameters<typeof labelTexture>[1]) {
  const { texture, aspect } = labelTexture(text, style);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.renderOrder = 10;
  sprite.scale.set(aspect * 0.32, 0.32, 1);
  return sprite;
}

type Slot = { group: THREE.Group; mats: THREE.MeshPhysicalMaterial[]; lift: number; target: number; palette?: Palette; opacity?: number };

export function mountScene(host: HTMLElement, initial: SceneOptions): SceneHandle {
  // Throws when WebGL is unavailable; the caller keeps the static fallback.
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  const reduce = initial.reducedMotion;
  renderer.setPixelRatio(capPixelRatio(window.devicePixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc4cbc2, 1.25));
  const key = new THREE.DirectionalLight(0xfff3e8, 2.5);
  key.position.set(4, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6 });
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.6);
  rim.position.set(-6, 3, -5);
  scene.add(rim);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.32;
  ground.receiveShadow = true;
  scene.add(ground);

  const world = new THREE.Group();
  scene.add(world);
  const cast = <T extends THREE.Object3D>(mesh: T): T => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // Plinth with grooves between schools: the grooves are scope boundaries.
  const plinth = cast(new THREE.Mesh(new RoundedBoxGeometry(8.6, 0.3, 3.4, 4, 0.12), clay(0xeceee9, { sheen: 0.2 })));
  plinth.position.y = -0.15;
  world.add(plinth);
  const grooveMat = clay(0xc9cec6);
  for (const gx of GROOVE_X) {
    const groove = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.04, 3.1, 2, 0.02), grooveMat);
    groove.position.set(gx, 0.01, 0);
    world.add(groove);
  }

  const pagesMat = clay(0xf7f3ea, { sheen: 0.1 });
  const books = [
    { w: 1.9, d: 1.45, h: 0.3, y: 0.15, r: -0.06 },
    { w: 1.75, d: 1.35, h: 0.27, y: 0.44, r: 0.1 },
    { w: 1.6, d: 1.28, h: 0.25, y: 0.7, r: -0.03 },
  ];
  const makeStack = (palette: Palette, ghost = false): Slot => {
    const group = new THREE.Group();
    const mats = books.map((book, i) => {
      const mat = clay(palette[i] ?? palette[0], ghost ? { transparent: true, opacity: 0.5 } : {});
      const bookGroup = new THREE.Group();
      bookGroup.add(cast(new THREE.Mesh(new RoundedBoxGeometry(book.w, book.h, book.d, 4, 0.06), mat)));
      if (!ghost) {
        const pages = cast(new THREE.Mesh(new RoundedBoxGeometry(book.w - 0.07, book.h - 0.08, book.d - 0.12, 2, 0.025), pagesMat));
        pages.position.x = 0.06;
        bookGroup.add(pages);
      }
      bookGroup.position.y = book.y;
      bookGroup.rotation.y = book.r;
      group.add(bookGroup);
      return mat;
    });
    return { group, mats, lift: 0, target: 0 };
  };
  const slots: Record<SlotId, Slot> = {
    locked: makeStack(PALETTE.grey),
    active: makeStack(PALETTE.active),
    next: makeStack(PALETTE.ghost, true),
  };
  for (const [id, slot] of Object.entries(slots) as [SlotId, Slot][]) {
    slot.group.position.set(SLOT_X[id], 0, STACK_Z);
    world.add(slot.group);
  }

  // Padlock on another school: no account can read another university's sources.
  const lock = new THREE.Group();
  lock.add(cast(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.34, 0.2, 3, 0.06), clay(0x56616a))));
  const shackle = cast(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 16, 32, Math.PI), clay(0x8a949b)));
  shackle.position.y = 0.17;
  lock.add(shackle);
  lock.position.set(SLOT_X.locked, 1.25, STACK_Z);
  world.add(lock);

  const label = textSprite(initial.schoolLabel, { bg: '#ffffff', size: 54 });
  label.position.set(SLOT_X.active, 1.55, STACK_Z);
  world.add(label);
  const plus = textSprite('+', { bg: '#a8431f', fg: '#ffffff', size: 70, pad: 18 });
  plus.scale.multiplyScalar(1.5);
  plus.position.set(SLOT_X.next, 1.2, STACK_Z);
  world.add(plus);

  // Open page in front of the reader's school: evidence lines, highlight strips and the citation pin.
  const page = new THREE.Group();
  page.add(cast(new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.06, 2.15, 3, 0.03), clay(0xffffff, { sheen: 0.15 }))));
  const lineMat = clay(0xd3d8d1, { sheen: 0 });
  LINE_WIDTHS.forEach((width, i) => {
    const line = new THREE.Mesh(new RoundedBoxGeometry(width, 0.022, 0.06, 2, 0.01), lineMat);
    const c = lineCenter(i);
    line.position.set(c.x, c.y, c.z);
    page.add(line);
  });
  const highlights = {} as Record<Citation, THREE.Mesh<RoundedBoxGeometry, THREE.MeshStandardMaterial>>;
  for (const [id, index] of Object.entries(EVIDENCE_LINE) as [Citation, number][]) {
    const width = LINE_WIDTHS[index] ?? 0;
    const strip = new THREE.Mesh(
      new RoundedBoxGeometry(width + 0.12, 0.018, 0.15, 2, 0.008),
      new THREE.MeshStandardMaterial({ color: 0xf2c48d, roughness: 1, transparent: true, opacity: 0 }),
    );
    strip.position.set(lineCenter(index).x, 0.036, lineZ(index));
    page.add(strip);
    highlights[id] = strip;
  }
  page.position.set(0.35, 0.5, 1.45);
  page.rotation.set(0.42, -0.18, -0.06);
  world.add(page);

  const numerals: Record<Citation, THREE.CanvasTexture> = { a: numeralTexture(1), b: numeralTexture(2) };
  const pin = new THREE.Group();
  const pinHead = cast(new THREE.Mesh(new THREE.SphereGeometry(0.24, 48, 32), clay(0xa8431f)));
  pinHead.position.y = 0.64;
  pin.add(pinHead);
  const face = new THREE.SpriteMaterial({ map: numerals.a, depthTest: false, transparent: true });
  const numeral = new THREE.Sprite(face);
  numeral.scale.setScalar(0.34);
  numeral.position.y = 0.64;
  numeral.renderOrder = 11;
  pin.add(numeral);
  const pinMetal = clay(0x8f3818);
  const stem = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 16), pinMetal));
  stem.position.y = 0.28;
  pin.add(stem);
  const tip = cast(new THREE.Mesh(new THREE.SphereGeometry(0.055, 24, 16), pinMetal));
  tip.position.y = 0.03;
  pin.add(tip);
  page.add(pin);

  // State
  let active = initial.activeCitation;
  const target = new THREE.Vector3();
  const tmp = new THREE.Color();
  const placePin = (snap: boolean) => {
    const p = pinTarget(active);
    target.set(p.x, p.y, p.z);
    if (snap) pin.position.copy(target);
    face.map = numerals[active];
    face.needsUpdate = true;
  };
  const applyScope = (scope: HeroScope, snap: boolean) => {
    const layout = scopeLayout(scope);
    for (const [id, slot] of Object.entries(slots) as [SlotId, Slot][]) {
      const next = layout.slots[id];
      slot.target = next.lift;
      if (next.palette) slot.palette = next.palette;
      if (next.opacity !== undefined) slot.opacity = next.opacity;
      if (snap) {
        slot.lift = slot.target;
        slot.group.position.y = slot.lift;
        const palette = slot.palette;
        if (palette) slot.mats.forEach((m, i) => m.color.setHex(palette[i] ?? palette[0]));
        const opacity = slot.opacity;
        if (opacity !== undefined) slot.mats.forEach(m => (m.opacity = opacity));
      }
    }
    page.visible = layout.pageVisible;
  };
  placePin(true);
  highlights[active].material.opacity = 1;
  applyScope(initial.scope, true);

  // Framing: auto-fit the bounding sphere, then shift up with setViewOffset so the answer card can overlap the lower edge.
  const center = new THREE.Vector3();
  const sphere = new THREE.Sphere();
  const bounds = new THREE.Box3().setFromObject(world);
  bounds.getCenter(center);
  bounds.getBoundingSphere(sphere);
  const view = new THREE.Vector3(VIEW_DIRECTION.x, VIEW_DIRECTION.y, VIEW_DIRECTION.z).normalize();

  let running = false;
  let visible = true;
  let lost = false;
  let disposed = false;
  let raf = 0;
  const pointer = { x: 0, y: 0 };
  const clock = new THREE.Clock();

  const render = () => {
    if (!lost && !disposed) renderer.render(scene, camera);
  };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.copy(center).addScaledVector(view, fitDistance(sphere.radius, camera.fov, camera.aspect) * CAMERA_DISTANCE_SCALE);
    camera.lookAt(center);
    camera.setViewOffset(width, height, 0, viewOffsetY(width, height), width, height);
    camera.updateProjectionMatrix();
    if (!running) render();
  };

  const step = (seconds: number, ease: number) => {
    for (const slot of Object.values(slots)) {
      slot.lift = approach(slot.lift, slot.target, ease);
      slot.group.position.y = slot.lift;
      const palette = slot.palette;
      if (palette) slot.mats.forEach((m, i) => m.color.lerp(tmp.setHex(palette[i] ?? palette[0]), ease));
      const opacity = slot.opacity;
      if (opacity !== undefined) slot.mats.forEach(m => (m.opacity = approach(m.opacity, opacity, ease)));
    }
    label.position.y = 1.55 + slots.active.lift;
    plus.position.y = 1.2 + slots.next.lift + Math.sin(seconds * 1.6) * 0.05;
    pin.position.lerp(target, ease);
    pin.position.y = target.y + Math.abs(Math.sin(seconds * 2.2)) * 0.05;
    for (const id of Object.keys(highlights) as Citation[]) {
      const m = highlights[id].material;
      m.opacity = approach(m.opacity, id === active ? 1 : 0, ease);
    }
  };
  const frame = () => {
    const seconds = clock.getElapsedTime();
    const rotation = worldRotationTarget(pointer, seconds);
    world.rotation.y = approach(world.rotation.y, rotation.y, 0.06);
    world.rotation.x = approach(world.rotation.x, rotation.x, 0.06);
    step(seconds, 0.1);
    render();
    raf = requestAnimationFrame(frame);
  };
  const play = () => {
    if (running || reduce || lost || disposed || !visible || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  // Reduced motion: snap to the new state and draw one frame.
  const still = () => {
    if (!reduce) return;
    step(0, 1);
    render();
  };

  const onPointerMove = (event: PointerEvent) => {
    const p = normalisedPointer(event.clientX, event.clientY, host.getBoundingClientRect());
    pointer.x = p.x;
    pointer.y = p.y;
  };
  const onPointerLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
  };
  const onVisibility = () => (document.hidden ? pause() : play());
  const onContextLost = () => {
    lost = true;
    pause();
    initial.onLost?.();
  };
  if (!reduce) {
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerleave', onPointerLeave);
  }
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    if (visible) play();
    else pause();
  });
  intersection.observe(host);

  resize();
  step(0, 1);
  render();
  requestAnimationFrame(() => {
    if (!lost && !disposed) initial.onReady?.();
  });
  play();

  const replaceLabel = (text: string) => {
    const old = label.material.map;
    const { texture, aspect } = labelTexture(text, { bg: '#ffffff', size: 54 });
    label.material.map = texture;
    label.material.needsUpdate = true;
    label.scale.set(aspect * 0.32, 0.32, 1);
    old?.dispose();
  };

  return {
    setCitation(citation) {
      if (disposed || citation === active) return;
      active = citation;
      placePin(reduce);
      still();
    },
    setScope(scope) {
      if (disposed) return;
      applyScope(scope, reduce);
      still();
    },
    setLabel(text) {
      if (disposed) return;
      replaceLabel(text);
      if (!running) render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pause();
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry as THREE.BufferGeometry);
          const mats: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
          mats.forEach(m => materials.add(m));
        } else if (object instanceof THREE.Sprite) {
          materials.add(object.material);
        }
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => {
        if (m instanceof THREE.SpriteMaterial) m.map?.dispose();
        m.dispose();
      });
      Object.values(numerals).forEach(t => t.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
