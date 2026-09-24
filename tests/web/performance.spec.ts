import { test, expect } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

// intent: measure actual driver calls, including instancing, without product telemetry; status: done.
test('actual WebGL draw calls per rendered frame', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    const target = window as Window & { archiveDraws: Record<string, number> };
    target.archiveDraws = {};
    let frame = 0;
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => raf.call(window, (time) => {
      frame = time;
      callback(time);
    });
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced'] as const) {
      const original = WebGL2RenderingContext.prototype[name];
      Object.defineProperty(WebGL2RenderingContext.prototype, name, { value: function (...args: number[]) {
        target.archiveDraws[frame] = (target.archiveDraws[frame] ?? 0) + 1;
        return Reflect.apply(original, this, args);
      } });
    }
  });
  await page.route('**/api/**', route => {
    const capability = { state: 'disabled', reason: 'not_configured' };
    if (route.request().url().endsWith('/capabilities')) return route.fulfill({ json: {
      mode: 'disabled', answers: capability, indexing: capability, discovery: capability,
      google: capability, email: capability, identity: capability,
    } });
    if (route.request().url().endsWith('/institutions')) return route.fulfill({ json: { items: [{
      id: '11111111-1111-4111-8111-111111111111', slug: 'demo',
      name: 'Demo university · synthetic test', coverage: 'synthetic_demo',
    }], next_cursor: null } });
    return route.fulfill({ status: 503, json: {} });
  });
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.evaluate(() => { (window as Window & { archiveDraws: Record<string, number> }).archiveDraws = {}; });
  await page.waitForTimeout(1200);
  const counts = await page.evaluate(() => Object.values((window as Window & { archiveDraws: Record<string, number> }).archiveDraws));
  expect(counts.length).toBeGreaterThan(2);
  const baseline = process.env.MOTION_BASELINE === '1';
  if (!baseline) expect(Math.max(...counts)).toBeLessThanOrEqual(160);
  const artifacts = new URL('./artifacts/', import.meta.url).pathname;
  await mkdir(artifacts, { recursive: true });
  const label = baseline ? 'before' : 'after';
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await page.screenshot({ path: `${artifacts}draws-${label}.png` });
  const evidence = { viewport: { width: 1440, height: 900 }, fixture: 'synthetic demo, disabled providers',
    browser: browser.version(), renderer: 'headless Chromium / ANGLE SwiftShader (software)',
    limitation: 'Draw calls only; not a physical phone FPS benchmark', counts,
    min: Math.min(...counts), max: Math.max(...counts), median: [...counts].sort((a,b) => a-b)[Math.floor(counts.length/2)] };
  await writeFile(`${artifacts}draws-${label}.json`, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }, { name: 'wide', width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    await page.locator('canvas').screenshot({ path: `${artifacts}comparison-${label}-${size.name}.png` });
  }
});
