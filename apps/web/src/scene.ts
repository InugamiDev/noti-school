import * as THREE from 'three';

// intent: bounded decorative archive, independent of HTML interaction; status: implemented.
export function mountArchive(host: HTMLElement, fail: () => void) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101314');
  scene.fog = new THREE.Fog('#101314', 9, 36);
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
  renderer.domElement.setAttribute('aria-label', 'Luminous document archive');
  host.append(renderer.domElement);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  geometries.push(box);
  const edge = new THREE.EdgesGeometry(box);
  geometries.push(edge);
  const shelfMat = new THREE.MeshStandardMaterial({
    color: '#343d40',
    metalness: 0.8,
    roughness: 0.36,
  });
  const paperMat = new THREE.MeshStandardMaterial({
    color: '#afbdc1',
    metalness: 0.3,
    roughness: 0.44,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: '#26363e',
    metalness: 0.45,
    roughness: 0.3,
  });
  const cyan = new THREE.MeshBasicMaterial({ color: '#87e9f5' });
  const red = new THREE.MeshBasicMaterial({ color: '#ee684c' });
  const white = new THREE.LineBasicMaterial({ color: '#b9d6de', transparent: true, opacity: 0.48 });
  materials.push(shelfMat, paperMat, darkMat, cyan, red, white);
  // intent: batch repeated boxes without changing folio transforms; status: implemented.
  const blocks = new Map<THREE.Material, THREE.Object3D[]>();
  function block(
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) {
    const mesh = new THREE.Object3D();
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    const batch = blocks.get(material) ?? [];
    batch.push(mesh);
    blocks.set(material, batch);
    return mesh;
  }
  const folios: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    for (let depth = 0; depth < 6; depth++) {
      const z = 3 - depth * 4;
      const x = side * 6.5;
      for (let level = 0; level < 4; level++) {
        const y = -2.4 + level * 2.45;
        block(scene, shelfMat, x, y, z, 4.5, 0.08, 2.4);
        block(
          scene,
          (level + depth) % 4 === 0 ? red : cyan,
          x,
          y + 0.06,
          z + 1.2,
          4.5,
          0.025,
          0.025,
        );
        for (let col = 0; col < 3; col++) {
          const group = new THREE.Group();
          group.position.set(x + (col - 1) * 1.3, y + 1.05, z + 0.35 + (col % 2) * 0.2);
          group.rotation.y = side * -0.13;
          const h = 1.45 + ((col + depth) % 3) * 0.13;
          block(
            group,
            (col + level + depth) % 3 === 0 ? paperMat : darkMat,
            0,
            0,
            0,
            0.95,
            h,
            0.16,
          );
          const outline = new THREE.LineSegments(edge, white);
          outline.scale.set(0.98, h + 0.02, 0.19);
          group.add(outline);
          block(group, (col + level + depth) % 6 === 0 ? red : cyan, -0.43, 0, 0.1, 0.018, h, 0.02);
          for (let line = 0; line < 7; line++)
            block(
              group,
              paperMat,
              0,
              0.45 - line * 0.12,
              0.095,
              0.55 - (line % 3) * 0.06,
              0.015,
              0.015,
            );
          scene.add(group);
          folios.push(group);
        }
      }
      block(scene, shelfMat, x - 2.2, 1.2, z, 0.05, 10, 0.05);
      block(scene, shelfMat, x + 2.2, 1.2, z, 0.05, 10, 0.05);
    }
  }
  const floor = new THREE.MeshStandardMaterial({
    color: '#182023',
    roughness: 0.36,
    metalness: 0.7,
  });
  materials.push(floor);
  block(scene, floor, 0, -2.6, -9, 35, 0.1, 50);
  for (const x of [-4, -2, 2, 4]) block(scene, shelfMat, x, -2.53, -9, 0.018, 0.01, 45);
  scene.updateMatrixWorld(true);
  const batches = [...blocks].map(([material, objects]) => {
    const mesh = new THREE.InstancedMesh(box, material, objects.length);
    const moving = objects.some((object) => object.parent !== scene);
    if (moving) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    objects.forEach((object, index) => mesh.setMatrixAt(index, object.matrixWorld));
    mesh.computeBoundingSphere();
    // The only animated instance displacement is a bounded 0.045-unit vertical bob.
    mesh.boundingSphere!.radius += 0.045;
    scene.add(mesh);
    return { mesh, objects, moving };
  });
  scene.add(new THREE.HemisphereLight('#d7eef8', '#172025', 3));
  const light = new THREE.PointLight('#d1f6ff', 70, 25);
  light.position.set(0, 3, 5);
  scene.add(light);
  const accent = new THREE.PointLight('#e56545', 30, 15);
  accent.position.set(6, 1, -4);
  scene.add(accent);
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
  const baseY = folios.map((f) => f.position.y);
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
    folios.forEach((f, i) => {
      f.position.y = baseY[i]! + (reduced ? 0 : Math.sin(elapsed * 0.5 + i) * 0.045);
      f.updateMatrixWorld(true);
    });
    for (const { mesh, objects, moving } of batches) {
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
    dispose() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('pointermove', pointer);
      media.removeEventListener('change', preference);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      batches.forEach(({ mesh }) => mesh.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
