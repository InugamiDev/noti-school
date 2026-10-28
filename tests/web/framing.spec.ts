import { test, expect } from '../../apps/web/node_modules/@playwright/test/index.mjs';

// intent: the Clay landing keeps the composer, its coverage line and the 3D stage framed at every common viewport.
const id = '11111111-1111-4111-8111-111111111111';
for (const [width, height] of [[1440, 900], [1920, 1080], [1583, 805], [1366, 768], [390, 844], [375, 667], [320, 568]]) {
  test(`landing keeps prompt, coverage and stage framed at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/**', route => {
      if (new URL(route.request().url()).pathname.endsWith('/institutions')) return route.fulfill({ json: {
        items: [{ id, slug: 'demo', name: 'UI preview only - no university data', coverage: 'synthetic_demo' }], next_cursor: null,
      } });
      return route.fulfill({ status: 503, json: { error: { code: 'core_unavailable', message: 'Synthetic unavailable fixture', request_id: id, retryable: false } } });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('University answers you can check.');
    const prompt = page.getByRole('textbox', { name: 'Your question', exact: true });
    await expect(prompt).toBeVisible();
    await expect(page.getByText('Demo collection, synthetic examples only')).toBeVisible();
    const measured = await page.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const form = document.querySelector('textarea')!.closest('form')!.getBoundingClientRect();
      const stage = box('[aria-label^="Clay illustration"]');
      const card = box('[aria-label="Example answer"]');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        form: { left: form.left, right: form.right, top: form.top },
        stage: { left: stage.left, right: stage.right, bottom: stage.bottom },
        card: { left: card.left, right: card.right, top: card.top },
      };
    });
    expect(measured.overflow).toBe(false);
    expect(measured.form.left).toBeGreaterThanOrEqual(0);
    expect(measured.form.right).toBeLessThanOrEqual(width!);
    // The question box starts in the first viewport even on the smallest phone.
    expect(measured.form.top).toBeLessThan(height!);
    expect(measured.stage.left).toBeGreaterThanOrEqual(0);
    expect(measured.stage.right).toBeLessThanOrEqual(width!);
    // The answer card overlaps the stage base and stays inside it horizontally.
    expect(measured.card.top).toBeLessThan(measured.stage.bottom);
    expect(measured.card.left).toBeGreaterThanOrEqual(measured.stage.left);
    expect(measured.card.right).toBeLessThanOrEqual(measured.stage.right);
    await page.screenshot({ path: new URL(`./artifacts/framing-${width}x${height}.png`, import.meta.url).pathname });
  });
}
