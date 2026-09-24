import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { createHash } from 'node:crypto';

const id = '11111111-1111-4111-8111-111111111111';
async function fixture(page: Page, disable = true) {
  if (disable) await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes('webgl')) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const capability = { state: 'disabled', reason: 'not_configured' };
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { mode: 'disabled', answers: capability,
      indexing: capability, discovery: capability, google: capability, email: capability, identity: capability } });
    if (path.endsWith('/institutions')) return route.fulfill({ json: { items: [{ id, slug: 'demo',
      name: 'Synthetic university', coverage: 'synthetic_demo' }], next_cursor: null } });
    return route.fulfill({ status: 503, json: { error: { code: 'provider_unavailable',
      message: 'Synthetic unavailable fixture', request_id: id, retryable: false, capability: 'answers' } } });
  });
}
const transform = (page: Page) => page.locator('.archive img').evaluate(el => getComputedStyle(el).transform);
async function pixels(page: Page, name: string) {
  const style = await page.addStyleTag({ content: '.hero-content,.motion-control,.archive-shade{visibility:hidden!important}' });
  const shot = await page.locator('.archive').screenshot({ animations: 'allow', path: new URL(`./artifacts/fallback-${name}.png`, import.meta.url).pathname });
  await style.evaluate(el => el.remove());
  return createHash('sha256').update(shot).digest('hex');
}
async function frozen(page: Page, name: string) {
  await page.waitForTimeout(100);
  const a = await pixels(page, `${name}-a`);
  await page.waitForTimeout(220);
  expect(await pixels(page, `${name}-b`)).toBe(a);
}

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`fallback pixels move and freeze; bounded coverage ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size); await fixture(page); await page.goto('/');
    await expect(page.locator('.archive')).toHaveClass(/fallback/);
    const first = await pixels(page, `${size.width}-entry`);
    await page.waitForTimeout(350);
    expect(await pixels(page, `${size.width}-moving`)).not.toBe(first);
    await page.getByRole('button', { name: 'Pause animation' }).click();
    await frozen(page, `${size.width}-paused`);
    await page.getByRole('button', { name: 'Resume animation' }).click();
    await page.waitForTimeout(2400);
    const ambient = await pixels(page, `${size.width}-ambient-a`);
    await page.waitForTimeout(350);
    expect(await pixels(page, `${size.width}-ambient-b`)).not.toBe(ambient);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await frozen(page, `${size.width}-reduced`);
    // Inspect every extreme of the actual effect, without product instrumentation.
    expect(await page.locator('.archive img').evaluate(el => {
      const animation = el.getAnimations()[0]!; animation.pause();
      const duration = Number(animation.effect!.getTiming().duration);
      return [0, duration / 2, duration].every(time => {
        animation.currentTime = time;
        const image = el.getBoundingClientRect(), host = el.parentElement!.getBoundingClientRect();
        return image.left <= host.left && image.right >= host.right && image.top <= host.top && image.bottom >= host.bottom;
      });
    })).toBe(true);
  });
}

test('initial reduced motion creates no animation; visibility, intersection and disposal release resources', async ({ page }) => {
  await page.addInitScript(() => {
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function(...args: Parameters<typeof add>) {
      if ((this === document && args[0] === 'visibilitychange') || (this instanceof MediaQueryList && args[0] === 'change')) performance.mark('test-listener-add');
      return add.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function(...args: Parameters<typeof remove>) {
      if ((this === document && args[0] === 'visibilitychange') || (this instanceof MediaQueryList && args[0] === 'change')) performance.mark('test-listener-remove');
      return remove.apply(this, args);
    };
    const observer = window.IntersectionObserver;
    window.IntersectionObserver = class extends observer {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super((entries, instance) => {
          // Screenshots scroll into view; retain the real offscreen observation during capture only.
          if (!performance.getEntriesByName('test-offscreen-capture').length) callback(entries, instance);
        }, options);
        performance.mark('test-observer-add');
      }
      disconnect() { performance.mark('test-observer-remove'); super.disconnect(); }
    };
  });
  await fixture(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.locator('.archive')).toHaveClass(/fallback/);
  expect(await page.locator('.archive img').evaluate(el => el.getAnimations().length)).toBe(0);
  await frozen(page, 'initial-reduced');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.locator('.archive img').evaluate(el => el.getAnimations()[0]?.playState)).toBe('running');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await frozen(page, 'hidden');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.locator('.archive img').evaluate(el => el.getAnimations()[0]?.playState)).toBe('paused');
  // Locator screenshots scroll into view; use effect time/transform while truly offscreen.
  const offscreen = await transform(page); await page.waitForTimeout(250); expect(await transform(page)).toBe(offscreen);
  await page.evaluate(() => performance.mark('test-offscreen-capture'));
  await frozen(page, 'offscreen');
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(100);
  await page.evaluate(() => performance.clearMarks('test-offscreen-capture'));
  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => page.locator('.archive img').evaluate(el => el.getAnimations()[0]?.playState)).toBe('running');
  const image = await page.locator('.archive img').elementHandle();
  const animation = await image!.evaluateHandle(el => el.getAnimations()[0]!);
  await page.getByRole('link', { name: 'For institutions' }).click();
  await expect(page.locator('.archive')).toHaveCount(0);
  expect(await animation.evaluate(a => ({ state: a.playState, finish: a.onfinish, time: a.currentTime }))).toEqual({ state: 'idle', finish: null, time: null });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(await image!.evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await page.evaluate(() => ({ listeners: performance.getEntriesByName('test-listener-add').length - performance.getEntriesByName('test-listener-remove').length,
    observers: performance.getEntriesByName('test-observer-add').length - performance.getEntriesByName('test-observer-remove').length }))).toEqual({ listeners: 0, observers: 0 });
});

test('submit during a failing lazy import keeps one immediate request and pending zoom', async ({ page }) => {
  await fixture(page, false);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/assets/scene-*.js', async route => { await gate; await route.abort(); });
  let calls = 0;
  page.on('request', request => { if (request.url().endsWith('/api/v1/answers')) calls++; });
  await page.goto('/'); await page.getByLabel('Your question').fill('Synthetic early submit');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(page.locator('.archive')).toHaveClass(/fallback/);
  await expect.poll(() => page.locator('.archive img').evaluate(el => el.getAnimations()[0]?.effect?.getTiming().duration)).toBe(600);
  await expect(page.locator('.archive')).toHaveCount(0); expect(calls).toBe(1);
});

test('fallback submit dispatches immediately once; return home does not replay zoom', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    document.addEventListener('submit', () => performance.mark('test-submit'), true);
    const fetch = window.fetch;
    window.fetch = function(input, init) {
      if (String(input).endsWith('/api/v1/answers')) performance.mark('test-request');
      return fetch.call(this, input, init);
    };
  });
  let calls = 0;
  page.on('request', request => { if (request.url().endsWith('/api/v1/answers')) calls++; });
  await page.goto('/'); await expect(page.locator('.archive')).toHaveClass(/fallback/);
  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.getByLabel('Your question').fill('Synthetic fallback question');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect.poll(() => calls).toBe(cycle);
    const delay = await page.evaluate(() => performance.getEntriesByName('test-request').at(-1)!.startTime - performance.getEntriesByName('test-submit').at(-1)!.startTime);
    expect(delay).toBeGreaterThanOrEqual(0); expect(delay).toBeLessThan(100);
    expect(await page.locator('.archive img').evaluate(el => el.getAnimations()[0]?.effect?.getTiming().duration)).toBe(600);
    await expect(page.locator('.archive')).toHaveCount(0);
    await page.locator('a.wordmark').click();
    await expect(page.locator('.archive')).toHaveClass(/fallback/);
    await expect.poll(() => page.locator('.archive img').evaluate(el => el.getAnimations()[0]?.effect?.getTiming().duration)).toBe(2200);
    expect(calls).toBe(cycle);
  }
});

test('live WebGL has no bitmap animation; context loss and import failure activate it', async ({ page }) => {
  await fixture(page, false); await page.goto('/'); await expect(page.locator('canvas')).toBeVisible();
  expect(await page.locator('.archive img').evaluate(el => el.getAnimations().length)).toBe(0);
  await page.locator('canvas').evaluate(el => el.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('.archive')).toHaveClass(/fallback/);
  await expect.poll(() => page.locator('.archive img').evaluate(el => el.getAnimations().length)).toBe(1);
  await page.route('**/assets/scene-*.js', route => route.abort());
  await page.reload(); await expect(page.locator('.archive')).toHaveClass(/fallback/);
  await expect.poll(() => page.locator('.archive img').evaluate(el => el.getAnimations().length)).toBe(1);
});
