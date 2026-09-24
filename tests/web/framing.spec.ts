import { test, expect } from '../../apps/web/node_modules/@playwright/test/index.mjs';

const id = '11111111-1111-4111-8111-111111111111';
for (const [width, height] of [[1440, 900], [1920, 1080], [1583, 805], [1366, 768], [390, 844], [375, 667], [320, 568]]) {
  test(`landing keeps prompt, coverage and next-section hint visible at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname.endsWith('/institutions')) return route.fulfill({ json: {
        items: [{ id, slug: 'demo', name: 'UI preview only - no university data', coverage: 'synthetic_demo' }], next_cursor: null,
      } });
      return route.fulfill({ status: 503, json: { error: { code: 'core_unavailable', message: 'Synthetic unavailable fixture', request_id: id, retryable: false } } });
    });
    await page.goto('/');
    await expect(page.locator('.hero h1')).toBeVisible();
    const measured = await page.evaluate(() => {
      const hint = document.querySelector('.section-number')!.getBoundingClientRect();
      const prompt = document.querySelector('.composer')!.getBoundingClientRect();
      const pause = document.querySelector('.motion-control')!.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('.coverage')!);
      const coverage = range.getBoundingClientRect();
      return { hintBottom: hint.bottom, overflow: document.documentElement.scrollWidth > innerWidth,
        overlap: coverage.left < pause.right && coverage.right > pause.left && coverage.top < pause.bottom && coverage.bottom > pause.top,
        prompt: { left: prompt.left, right: prompt.right, bottom: prompt.bottom } };
    });
    expect(measured.overflow).toBe(false);
    expect(measured.overlap).toBe(false);
    expect(measured.hintBottom).toBeLessThanOrEqual(height!);
    expect(measured.prompt.left).toBeGreaterThanOrEqual(0);
    expect(measured.prompt.right).toBeLessThanOrEqual(width!);
    expect(measured.prompt.bottom).toBeLessThanOrEqual(height!);
    await page.screenshot({ path: new URL(`./artifacts/framing-${width}x${height}.png`, import.meta.url).pathname });
  });
}
