import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
// intent: loading states against a slow synthetic API: while identity, the school list or route data is pending, no route
//         renders its signed-out, forbidden, empty or unavailable state; regions are aria-busy with skeletons shaped like
//         the content, so arrival causes no layout shift, and the header account control keeps one box throughout.
// status: done
// next: fixtures are explicitly synthetic and copied from workspace-clay.spec.ts; extend the route table for new regions.
// confidence: high
const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const time = '2026-09-25T00:00:00Z';
const source = { id: sourceId, institution_id: id, title: 'Sample Student Handbook · synthetic fixture', kind: 'pdf', original_url: null, visibility: 'institution', current_version_id: versionId, created_at: time };
const second = { ...source, id: '55555555-5555-4555-8555-555555555555', title: 'Quy chế đào tạo mẫu · dữ liệu thử nghiệm', kind: 'text', current_version_id: null };
const third = { ...source, id: '66666666-6666-4666-8666-666666666666', title: 'Synthetic course catalogue fixture', kind: 'url', original_url: 'https://example.test/synthetic', current_version_id: null };
const conversations = [
  { id: '77777777-7777-4777-8777-777777777777', institution_id: id, created_at: time },
  { id: '88888888-8888-4888-8888-888888888888', institution_id: id, created_at: time },
  { id: '99999999-9999-4999-8999-999999999999', institution_id: id, created_at: time },
];
const feedback = { id, institution_id: id, answer_id: id, category: 'unsupported', evidence_id: null, comment: 'Synthetic feedback fixture.', status: 'open', created_at: time };
const sizes = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
// Texts of states that must never render while the answer to "who is this and which school" is still unknown.
const settledStates = [
  'Not signed in.',
  'No school membership on this account.',
  'The collection is unavailable',
  'Sign in with an administrator membership',
  'Sign in to see your conversations',
  'No conversations for this school',
  'No conversations yet',
  'No sources yet',
  'Budget unavailable.',
  'No feedback loaded.',
];

async function slowApi(page: Page, delay: number, role: 'student' | 'admin' = 'student') {
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const cap = { state: 'available', reason: 'ready' }, off = { state: 'disabled', reason: 'not_configured' };
    let body: unknown;
    if (path.endsWith('/capabilities')) body = { mode: 'mock', answers: cap, indexing: cap, discovery: cap, google: off, email: off, identity: cap };
    else if (path.endsWith('/institutions')) body = { items: [{ id, slug: 'synthetic', name: 'Synthetic University', coverage: 'synthetic_demo' }], next_cursor: null };
    else if (path.endsWith('/me')) body = { identity: { user_id: 'synthetic-user', session_id: 'synthetic-session', email_verified: true, expires_at: '2027-01-01T00:00:00Z' }, memberships: [{ institution_id: id, role }] };
    else if (path.endsWith('/conversations')) body = { items: conversations, next_cursor: null };
    else if (path.endsWith('/sources')) body = { items: [source, second, third], next_cursor: null };
    else if (path.endsWith('/budget')) body = { month: '2026-10', cap_micro_usd: 50000000, spent_micro_usd: 1250000, reserved_micro_usd: 0, currency: 'USD' };
    else if (path.endsWith('/feedback')) body = { items: [feedback], next_cursor: null };
    else if (path.endsWith('/graph')) body = { items: [], next_cursor: null };
    await new Promise(resolve => setTimeout(resolve, delay));
    if (body) return route.fulfill({ json: body });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'Synthetic', request_id: id, retryable: false } } });
  }).catch(() => undefined);
}

// Buffered, so shifts from the first paint onwards count; shifts right after input are excluded as the metric does.
// Web fonts are blocked so the page keeps one font for the whole load: with the system fallback, the font swap alone
// re-wraps the pilot notice and page titles at 390px (about 0.03 to 0.06 before any API response). That font-loading
// shift is reported separately; this budget covers the loading states.
async function observeLayoutShift(page: Page) {
  await page.route(/\.woff2?$/, route => route.abort());
  await page.addInitScript(() => {
    const state = { cls: 0 };
    Object.defineProperty(window, 'layoutShift', { get: () => state.cls });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[])
        if (!entry.hadRecentInput) state.cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
}
const layoutShift = (page: Page) => page.evaluate(() => (window as Window & { layoutShift?: number }).layoutShift ?? 0);
const accountWidth = (page: Page) =>
  page.locator('.site-nav-account').evaluate(element => element.getBoundingClientRect().width);

const routes = [
  { hash: '#/sources', role: 'student' as const, content: (page: Page) => page.getByRole('link', { name: /Sample Student Handbook/ }) },
  { hash: '#/history', role: 'student' as const, content: (page: Page) => page.getByRole('link', { name: /Open conversation/ }).first() },
  { hash: '#/admin', role: 'admin' as const, content: (page: Page) => page.getByRole('button', { name: 'Create source' }) },
  { hash: '#/answer', role: 'student' as const, content: (page: Page) => page.getByText('Synthetic University', { exact: true }) },
];

for (const size of sizes) {
  for (const route of routes) {
    test(`${route.hash} at ${size.width}px loads without a wrong state, reflow or header jump`, async ({ page }) => {
      await page.setViewportSize(size);
      await observeLayoutShift(page);
      await slowApi(page, 1500, route.role);
      await page.goto(`/${route.hash}`);
      const main = page.locator('main');
      // (a) pending: busy region, skeleton shown after its delay, and no settled state rendered from unknown data.
      await expect(main.locator('[aria-busy="true"]').first()).toBeAttached();
      await expect(main.locator('[data-skeleton]').first()).toBeVisible();
      for (const text of settledStates) await expect(page.getByText(text)).toHaveCount(0);
      await expect(page.locator('.site-nav-account')).toHaveCount(1);
      await expect(page.locator('.site-nav-account', { hasText: /Sign in|Account/ })).toHaveCount(0);
      const before = await accountWidth(page);
      // (b) loaded: no busy region left, content visible, still no settled-negative state.
      await expect(route.content(page)).toBeVisible({ timeout: 10000 });
      await expect(main.locator('[aria-busy="true"]')).toHaveCount(0);
      await expect(main.locator('[data-skeleton]')).toHaveCount(0);
      for (const text of settledStates) await expect(page.getByText(text)).toHaveCount(0);
      // (d) the account control keeps its box from placeholder to final label.
      await expect(page.locator('.site-nav-account')).toHaveText('Account');
      expect(await accountWidth(page)).toBe(before);
      // (c) cumulative layout shift over the whole load, read after the reveal has settled.
      await page.waitForTimeout(300);
      const cls = await layoutShift(page);
      test.info().annotations.push({ type: 'cls', description: cls.toFixed(4) });
      expect(cls).toBeLessThan(0.02);
    });
  }
}

test('a 50 ms response never shows a skeleton', async ({ page }) => {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(window, 'skeletonsSeen', { get: () => seen });
    const check = () => {
      for (const element of document.querySelectorAll<HTMLElement>('[data-skeleton]'))
        if (element.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
          seen.push(`${location.hash} ${element.className}`);
    };
    new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
    const frame = () => {
      check();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (const route of routes) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await slowApi(page, 50, route.role);
    await page.goto(`/${route.hash}`);
    await page.reload();
    await expect(route.content(page)).toBeVisible();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as Window & { skeletonsSeen?: string[] }).skeletonsSeen ?? [])).toEqual([]);
  }
});
