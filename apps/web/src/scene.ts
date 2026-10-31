import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Matte clay palette; the canvas clears to the page background so the scene blends into the layout.
export const clay = {
  background: '#efe8df',
  shelf: '#f4e8da',
  floor: '#e8ddd0',
  page: '#fbf6ef',
  tones: ['#f0ae92', '#a9c5a4', '#a9c3dd', '#f1d189', '#c8b9e0', '#e48b6c'],
};

// intent: bounded decorative clay archive, independent of HTML interaction; status: implemented.
export function mountArchive(host: HTMLElement, fail: () => void) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(clay.background);
  scene.fog = new THREE.Fog(clay.background, 13, 40);
  const camera = new THREE.PerspectiveCamera(47, 1, 0.1, 65);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'low-power',
    });
  } catch {
    fail();
    return { setPaused() {}, zoom() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-label', 'Clay document archive');
  host.append(renderer.domElement);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const keep = <T extends THREE.BufferGeometry>(g: T) => (geometries.push(g), g);
  const shelfGeo = keep(new RoundedBoxGeometry(4.6, 0.26, 2.1, 3, 0.11));
  const postGeo = keep(new RoundedBoxGeometry(0.3, 7.6, 0.3, 2, 0.14));
  const bookGeo = keep(new RoundedBoxGeometry(0.34, 1, 1.05, 2, 0.08));
  const pebbleGeo = keep(new THREE.SphereGeometry(1, 28, 18));
  const tileGeo = keep(new RoundedBoxGeometry(1.25, 1.6, 0.14, 3, 0.07));
  const lineGeo = keep(new THREE.CapsuleGeometry(0.035, 1, 4, 8).rotateZ(Math.PI / 2));
  const floorGeo = keep(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2));
  const shadowGeo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));

  const matte = (color: string) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
    materials.push(material);
    return material;
  };
  const shelfMat = matte(clay.shelf);
  const floorMat = matte(clay.floor);
  const pageMat = matte(clay.page);
  const tones = clay.tones.map(matte);
  // Soft contact shadows are baked into a gradient texture: no shadow pass, no extra draw calls.
  const blob = document.createElement('canvas');
  blob.width = blob.height = 128;
  const paint = blob.getContext('2d');
  if (paint) {
    const gradient = paint.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(120, 92, 70, 0.34)');
    gradient.addColorStop(1, 'rgba(120, 92, 70, 0)');
    paint.fillStyle = gradient;
    paint.fillRect(0, 0, 128, 128);
  }
  const shadowTexture = new THREE.CanvasTexture(blob);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
  });
  materials.push(shadowMat);

  // Deterministic layout: the archive looks the same on every visit.
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]!;

  // intent: batch every (geometry, material) pair into one instanced draw; status: implemented.
  const batches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; objects: THREE.Object3D[] }>();
  function place(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0],
  ) {
    const object = new THREE.Object3D();
    object.position.set(...position);
    object.scale.set(...scale);
    object.rotation.set(...rotation);
    parent.add(object);
    const key = `${geometry.uuid}:${material.uuid}`;
    const batch = batches.get(key) ?? { geometry, material, objects: [] };
    batch.objects.push(object);
    batches.set(key, batch);
    return object;
  }

  place(floorGeo, floorMat, scene, [0, -2.75, -8], [50, 1, 50]);
  for (const side of [-1, 1]) {
    for (let bay = 0; bay < 5; bay++) {
      const x = side * 7.1;
      const z = 0.5 - bay * 4.8;
      place(postGeo, shelfMat, scene, [x - 2.15, 1, z]);
      place(postGeo, shelfMat, scene, [x + 2.15, 1, z]);
      place(shadowGeo, shadowMat, scene, [x, -2.73, z], [6.4, 1, 3.4]);
      for (let level = 0; level < 3; level++) {
        const y = -2.3 + level * 2.6;
        place(shelfGeo, shelfMat, scene, [x, y, z]);
        // A row of books, occasionally interrupted by a resting pebble or a leaning volume.
        let cursor = x - 1.85;
        while (cursor < x + 1.7) {
          const width = 0.8 + random() * 0.6;
          const height = 1.15 + random() * 0.65;
          // Leave occasional gaps so the shelves breathe.
          if (random() < 0.14) {
            cursor += 0.35 + random() * 0.3;
            continue;
          }
          if (random() < 0.12) {
            const r = 0.32 + random() * 0.12;
            place(pebbleGeo, pick(tones), scene, [cursor + r, y + 0.13 + r * 0.8, z + 0.2], [r, r * 0.8, r]);
            cursor += r * 2 + 0.12;
            continue;
          }
          const lean = random() < 0.1 ? side * -0.22 : 0;
          place(
            bookGeo,
            pick(tones),
            scene,
            [cursor + (0.17 * width), y + 0.13 + height / 2, z + 0.15 + (random() - 0.5) * 0.18],
            [width, height, 1],
            [0, (random() - 0.5) * 0.08, lean],
          );
          cursor += 0.34 * width + 0.05 + (lean ? 0.16 : 0);
        }
      }
    }
  }

  // Floating clay notes and pebbles: the only moving elements, kept clear of the composer.
  const floaters: { group: THREE.Group; base: THREE.Vector3; turn: THREE.Euler; phase: number; spin: number }[] = [];
  function floater(x: number, y: number, z: number, build: (group: THREE.Group) => void) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    scene.add(group);
    build(group);
    floaters.push({ group, base: group.position.clone(), turn: group.rotation.clone(), phase: random() * Math.PI * 2, spin: 0.15 + random() * 0.2 });
  }
  const note = (tone: THREE.Material, tilt: number) => (group: THREE.Group) => {
    group.rotation.set(0.12, tilt, tilt * 0.4);
    place(tileGeo, pageMat, group, [0, 0, 0]);
    place(tileGeo, tone, group, [0.07, -0.07, -0.1], [1, 1, 0.8]);
    for (let line = 0; line < 4; line++)
      place(lineGeo, line === 0 ? tone : shelfMat, group, [-0.12 + (line % 2) * 0.08, 0.45 - line * 0.26, 0.09], [line === 0 ? 0.6 : 0.78 - (line % 2) * 0.2, 1, 1]);
  };
  const pebble = (tone: THREE.Material, size: number) => (group: THREE.Group) => {
    place(pebbleGeo, tone, group, [0, 0, 0], [size, size * 0.86, size]);
  };
  floater(-4.6, 3.7, 2.2, note(tones[0]!, 0.42));
  floater(4.7, 0.9, 2.6, note(tones[2]!, -0.46));
  floater(-4.3, -1.2, 3.4, pebble(tones[1]!, 0.34));
  floater(4.1, 3.9, 0.6, pebble(tones[3]!, 0.3));
  floater(2.6, -2.1, -2.5, pebble(tones[4]!, 0.4));
  floater(-2.4, 4.6, -7.5, pebble(tones[5]!, 0.32));

  scene.updateMatrixWorld(true);
  const meshes = [...batches.values()].map(({ geometry, material, objects }) => {
    const mesh = new THREE.InstancedMesh(geometry, material, objects.length);
    const moving = objects.some((object) => object.parent !== scene);
    if (moving) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Floating instances drift and turn; skip culling instead of guessing their bounds.
      mesh.frustumCulled = false;
    }
    objects.forEach((object, index) => mesh.setMatrixAt(index, object.matrixWorld));
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return { mesh, objects, moving };
  });

  scene.add(new THREE.HemisphereLight('#fff7ee', '#d8c1ac', 2.1));
  const key = new THREE.DirectionalLight('#fff0e0', 2.3);
  key.position.set(5, 9, 7);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#dfe7ff', 0.75);
  fill.position.set(-7, 2, 5);
  scene.add(fill);

  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches,
    paused = false,
    visible = true,
    dead = false,
    lost = false,
    raf = 0;
  let elapsed = reduced ? 2 : 0,
    last = 0,
    zoomStart: number | null = null,
    pointerX = 0,
    pointerY = 0;
  function draw() {
    if (dead || lost || !visible || document.hidden) return;
    const entry = reduced ? 0 : 1.2 * Math.max(0, 1 - elapsed / 1.8) ** 3;
    const zoom =
      zoomStart === null ? 0 : 2.6 * (1 - (1 - Math.min((elapsed - zoomStart) / 0.55, 1)) ** 3);
    camera.position.set(
      pointerX,
      0.6 + pointerY,
      12 + entry + (reduced ? 0 : Math.sin(elapsed * 0.4) * 0.12) - zoom,
    );
    camera.lookAt(0, 0.6, -12);
    // Bounded drift: at most 0.16 units of bob and a few degrees of turn.
    for (const { group, base, turn, phase, spin } of floaters) {
      const t = reduced ? 0 : elapsed;
      group.position.set(base.x, base.y + Math.sin(t * 0.7 + phase) * 0.16, base.z);
      group.rotation.set(turn.x, turn.y + Math.sin(t * spin + phase) * 0.14, turn.z + Math.sin(t * spin * 0.8 + phase) * 0.05);
      group.updateMatrixWorld(true);
    }
    for (const { mesh, objects, moving } of meshes) {
      if (!moving) continue;
      objects.forEach((object, index) => mesh.setMatrixAt(index, object.matrixWorld));
      mesh.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
  }
  function tick(now: number) {
    raf = 0;
    if (dead || lost || paused || reduced || !visible || document.hidden) return;
    elapsed += last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    draw();
    raf = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(raf);
    raf = 0;
    last = 0;
    if (!dead && !lost && !paused && !reduced && visible && !document.hidden)
      raf = requestAnimationFrame(tick);
  }
  function resize() {
    if (dead || lost) return;
    const { width, height } = host.getBoundingClientRect();
    camera.aspect = width / Math.max(height, 1);
    camera.fov = width < 600 ? 65 : 47;
    camera.updateProjectionMatrix();
    // Portrait screens would crop the side shelves entirely; draw the corridor narrower instead.
    const squeeze = Math.min(1, Math.max(0.58, camera.aspect * 0.85));
    for (const { mesh } of meshes) mesh.scale.x = squeeze;
    renderer.setSize(width, height);
    draw();
  }
  function preference() {
    if (dead || lost) return;
    reduced = media.matches;
    pointerX = pointerY = 0;
    if (reduced) {
      elapsed = 2;
      zoomStart = null;
      draw();
    }
    sync();
  }
  function pointer(event: PointerEvent) {
    if (paused || reduced || !visible || document.hidden || !matchMedia('(pointer: fine)').matches)
      return;
    const rect = host.getBoundingClientRect();
    pointerX += (((event.clientX - rect.left) / rect.width - 0.5) * 0.25 - pointerX) * 0.08;
    pointerY += (-((event.clientY - rect.top) / rect.height - 0.5) * 0.15 - pointerY) * 0.08;
  }
  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    sync();
    renderer.domElement.hidden = true;
    // The bitmap fallback replaces the scene for this mount; release GPU-side objects now.
    dispose();
    fail();
  }
  const observer = new IntersectionObserver((entries) => {
    if (dead) return;
    visible = entries[0]?.isIntersecting ?? false;
    if (visible && (paused || reduced)) draw();
    sync();
  });
  observer.observe(host);
  const resizer = new ResizeObserver(resize);
  resizer.observe(host);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pointermove', pointer);
  media.addEventListener('change', preference);
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  resize();
  sync();
  return {
    setPaused(value: boolean) {
      paused = value;
      sync();
    },
    zoom() {
      if (!reduced && !paused) zoomStart = elapsed;
    },
    dispose,
  };
  // Idempotent: shared by context loss and unmount.
  function dispose() {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    resizer.disconnect();
    document.removeEventListener('visibilitychange', sync);
    window.removeEventListener('pointermove', pointer);
    media.removeEventListener('change', preference);
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    meshes.forEach(({ mesh }) => mesh.dispose());
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    shadowTexture.dispose();
    renderer.dispose();
    if (!lost) renderer.forceContextLoss();
    renderer.domElement.remove();
  }
}
