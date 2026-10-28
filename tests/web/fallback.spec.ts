import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';

// intent: the Clay hero degrades to its static illustration without WebGL, on context loss and on import failure,
//         and never delays or duplicates the question request.
const id = '11111111-1111-4111-8111-111111111111';
const stage = (page: Page) => page.getByRole('img', { name: /Clay illustration/ });
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

for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`without WebGL the static illustration stays and the composer works at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size); await fixture(page); await page.goto('/');
    await stage(page).scrollIntoViewIfNeeded();
    await expect(stage(page).getByText('Handbook illustration')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(stage(page).locator('canvas')).toHaveCount(0);
    await expect(stage(page).getByText('Handbook illustration')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Your question', exact: true })).toBeVisible();
    await page.screenshot({ path: new URL(`./artifacts/fallback-${size.width}.png`, import.meta.url).pathname });
  });
}

test('fallback submit dispatches immediately once and returning home does not resend', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    document.addEventListener('submit', () => performance.mark('test-submit'), true);
    const fetch = window.fetch;
    window.fetch = function (input, init) {
      if (String(input).endsWith('/api/v1/answers')) performance.mark('test-request');
      return fetch.call(this, input, init);
    };
  });
  let calls = 0;
  page.on('request', request => { if (request.url().endsWith('/api/v1/answers')) calls++; });
  await page.goto('/');
  for (let cycle = 1; cycle <= 2; cycle++) {
    await page.getByRole('textbox', { name: 'Your question', exact: true }).fill('Synthetic fallback question');
    await page.getByRole('button', { name: 'Ask', exact: true }).click();
    await expect.poll(() => calls).toBe(cycle);
    const delay = await page.evaluate(() => performance.getEntriesByName('test-request').at(-1)!.startTime - performance.getEntriesByName('test-submit').at(-1)!.startTime);
    expect(delay).toBeGreaterThanOrEqual(0); expect(delay).toBeLessThan(100);
    await expect(page.getByRole('heading', { name: 'Your answer' })).toBeVisible();
    await expect(stage(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'noti.school home' }).click();
    await expect(stage(page)).toBeVisible();
    await page.waitForTimeout(300);
    expect(calls).toBe(cycle);
  }
});

test('live WebGL hides the fallback; context loss and import failure bring it back', async ({ page }) => {
  await fixture(page, false); await page.goto('/');
  await expect(stage(page).locator('canvas')).toBeVisible();
  await expect(stage(page).getByText('Handbook illustration')).toBeHidden();
  await stage(page).locator('canvas').evaluate(el => el.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(stage(page).getByText('Handbook illustration')).toBeVisible();
  await page.route('**/assets/scene-*.js', route => route.abort());
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(stage(page).locator('canvas')).toHaveCount(0);
  await expect(stage(page).getByText('Handbook illustration')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your question', exact: true })).toBeVisible();
});

test('initial reduced motion renders still frames; hidden tab and unmount stop drawing', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & { drawCount: number };
    target.drawCount = 0;
    for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const) {
      const original = WebGL2RenderingContext.prototype[name];
      Object.defineProperty(WebGL2RenderingContext.prototype, name, { value: function (...args: number[]) {
        target.drawCount++; return Reflect.apply(original, this, args);
      } });
    }
  });
  const draws = () => page.evaluate(() => (window as Window & { drawCount: number }).drawCount);
  await fixture(page, false); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(stage(page).locator('canvas')).toBeVisible();
  await expect.poll(draws).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const still = await draws();
  await page.waitForTimeout(600);
  expect(await draws(), 'Reduced motion draws only on state change').toBe(still);
  // A state change (citation) renders exactly one more still frame batch, then stops again.
  await page.getByRole('button', { name: 'Citation 2' }).click();
  await expect.poll(draws).toBeGreaterThan(still);
  const changed = await draws();
  await page.waitForTimeout(400);
  expect(await draws()).toBe(changed);
  await page.getByRole('banner').getByRole('link', { name: 'For universities' }).click();
  await expect(page.locator('canvas')).toHaveCount(0);
  const disposed = await draws();
  await page.waitForTimeout(300);
  expect(await draws()).toBe(disposed);
});
