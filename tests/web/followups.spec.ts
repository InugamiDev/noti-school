import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
// intent: regression checks for the Clay follow-ups (campaign noti-clay-followups-20261030): small-button hit areas
//         (FU3), font-swap layout shift with the self-hosted fonts actually loading (FU4) and the open review findings
//         R2 to R10 from reviews/revamp-review.md. Synthetic fixtures only; no provider is called.
// status: done
// next: add a case here when a later review reopens one of these findings.
// confidence: high for geometry and CLS in headless Chromium; real-device font rendering is not covered.
const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const citationId = '44444444-4444-4444-8444-444444444444';
const time = '2026-09-25T00:00:00Z';
// 83 characters, Vietnamese, clearly synthetic: the long-name case from review finding R2.
const longName = 'Trường Đại học Thử nghiệm Liên ngành Khoa học và Công nghệ Ứng dụng · dữ liệu thử 1';
const evidence = { id: citationId, institution_id: id, source_id: sourceId, version_id: versionId, chunk_id: id, title: 'Sample Student Handbook · synthetic fixture', version_label: 'Synthetic 2025 edition', locator: { page: 31, section: 'Section 4.2', start_char: 0, end_char: 40 }, quote: 'Synthetic passage: students may withdraw until the end of the tenth week.', original_url: null };
const answered = { id, conversation_id: id, institution_id: id, status: 'answered', language: 'en', claims: [{ text: 'Synthetic fixture: withdrawal is possible until the end of week 10.', evidence_ids: [citationId] }], evidence: [evidence], explanation: null, created_at: time };
const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

type Options = { name?: string; me?: 'student' | 'signed-out' | 'outage' };
async function fixture(page: Page, options: Options = {}) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname, method = route.request().method();
    const cap = { state: 'available', reason: 'ready' };
    const fail = (status: number, code: string) => route.fulfill({ status, json: { error: { code, message: 'Synthetic', request_id: id, retryable: false } } });
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { mode: 'mock', answers: cap, indexing: cap, discovery: cap, google: cap, email: cap, identity: cap } });
    if (path.endsWith('/institutions')) return route.fulfill({ json: { items: [{ id, slug: 'synthetic', name: options.name ?? 'Synthetic University', coverage: 'synthetic_demo' }], next_cursor: null } });
    if (path.endsWith('/me')) {
      if (options.me === 'signed-out') return fail(401, 'unauthenticated');
      if (options.me === 'outage') return fail(503, 'core_unavailable');
      return route.fulfill({ json: { identity: { user_id: 'synthetic-user', session_id: 'synthetic-session', email_verified: true, expires_at: '2027-01-01T00:00:00Z' }, memberships: [{ institution_id: id, role: 'student' }] } });
    }
    if (path.endsWith('/answers') && method === 'POST') return route.fulfill({ json: answered });
    if (path.includes('/citations/')) return route.fulfill({ json: evidence });
    if (path.includes('/chunks/')) return route.fulfill({ json: { id, institution_id: id, source_id: sourceId, version_id: versionId, ordinal: 0, text: 'Synthetic full passage.', locator: evidence.locator, language: 'en' } });
    if (path.endsWith(`/versions/${versionId}`)) return route.fulfill({ json: { id: versionId, institution_id: id, source_id: sourceId, label: 'Synthetic 2025 edition', sha256: 'a'.repeat(64), status: 'approved', indexing: 'ready', effective_from: null, effective_until: null, created_at: time } });
    if (path.endsWith('/conversations')) return route.fulfill({ json: { items: [], next_cursor: null } });
    return fail(404, 'not_found');
  });
}
async function askSynthetic(page: Page) {
  await page.goto('/');
  await page.getByLabel('Your question').fill('Synthetic question');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('button', { name: /citation 1/i }).first()).toBeVisible();
}
const box = async (page: Page, selector: string) => {
  const rect = await page.locator(selector).first().boundingBox();
  if (!rect) throw new Error(`${selector} has no box`);
  return rect;
};
/** The element hit at a point is the target or inside it, so a click or tap there reaches the control. */
const hits = (page: Page, selector: string, x: number, y: number) =>
  page.evaluate(([selector, x, y]) => {
    const target = document.querySelector(selector as string), hit = document.elementFromPoint(x as number, y as number);
    return !!target && !!hit && (hit === target || target.contains(hit));
  }, [selector, x, y] as const);
/** Size of the area around a control's centre that still hits it, probed at 0.5px steps along both axes. */
async function hitArea(page: Page, selector: string) {
  return page.evaluate((selector) => {
    const target = document.querySelector(selector)!;
    const r = target.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inside = (x: number, y: number) => { const hit = document.elementFromPoint(x, y); return !!hit && (hit === target || target.contains(hit)); };
    const reach = (dx: number, dy: number) => { let d = 0; while (d < 60 && inside(cx + dx * (d + 0.5), cy + dy * (d + 0.5))) d += 0.5; return d; };
    return { width: reach(-1, 0) + reach(1, 0), height: reach(0, -1) + reach(0, 1) };
  }, selector);
}

test('FU3: a small button keeps its 36px box and reaches a 44px hit area', async ({ page }) => {
  await page.setViewportSize(phone);
  await fixture(page, { me: 'signed-out' });
  await page.goto('/');
  // The footer motion control is a real `size="sm"` Button.
  const control = page.locator('.site-footer-bottom button');
  await control.scrollIntoViewIfNeeded();
  const rect = await box(page, '.site-footer-bottom button');
  expect(Math.round(rect.height)).toBe(36);
  await page.locator('.site-footer-bottom button').evaluate(element => element.setAttribute('data-probe', ''));
  const cx = rect.x + rect.width / 2, top = rect.y + rect.height / 2 - 22, bottom = rect.y + rect.height / 2 + 22;
  // Just inside the 44px edges hits the button; just outside does not.
  expect(await hits(page, '[data-probe]', cx, top + 0.5)).toBe(true);
  expect(await hits(page, '[data-probe]', cx, bottom - 0.5)).toBe(true);
  expect(await hits(page, '[data-probe]', cx, top - 1.5)).toBe(false);
  expect(await hits(page, '[data-probe]', cx, bottom + 1.5)).toBe(false);
});

test('R4 and R5: phone controls under 44px visuals still have 44x44 hit areas', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize(phone);
  await fixture(page);
  await askSynthetic(page);
  const targets = await page.evaluate(() => {
    const mark = (element: Element | null, name: string) => element?.setAttribute('data-target', name);
    const thumbs = document.querySelectorAll('[aria-label="Answer language"] button');
    mark(thumbs[0] ?? null, 'en');
    mark(thumbs[1] ?? null, 'vi');
    mark(document.querySelector('main button[aria-pressed][aria-label^="Citation 1"]'), 'cite');
    mark(document.querySelector('button[aria-label="Copy citation"]'), 'copy');
    mark(document.querySelector('.site-footer-groups a'), 'footer-link');
    mark(document.querySelector('.site-footer-bottom button'), 'motion');
    return [...document.querySelectorAll('[data-target]')].map(element => element.getAttribute('data-target'));
  });
  expect([...targets].sort()).toEqual(['cite', 'copy', 'en', 'footer-link', 'motion', 'vi']);
  for (const name of targets) {
    const selector = `[data-target="${name}"]`;
    await page.locator(selector).scrollIntoViewIfNeeded();
    const area = await hitArea(page, selector);
    expect.soft(area.width, `${name} hit width`).toBeGreaterThanOrEqual(43.5);
    expect.soft(area.height, `${name} hit height`).toBeGreaterThanOrEqual(43.5);
  }
});

// Fonts are served by the preview server like in production (nothing blocked), so the swap from the fallback face
// to the web font is inside the measurement. Shifts right after input are excluded, as the metric does.
for (const size of [phone, desktop])
  test(`FU4: loading the web fonts on #/ shifts layout by less than 0.02 at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const state = { cls: 0, entries: [] as string[] };
      Object.defineProperty(window, 'fontShift', { get: () => state });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node?: Node }[] })[]) {
          if (entry.hadRecentInput) continue;
          state.cls += entry.value;
          state.entries.push(`${entry.value.toFixed(4)} ${entry.sources.map(s => (s.node as Element | undefined)?.nodeName ?? '?').join(',')}`);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const fonts: string[] = [];
    page.on('requestfinished', request => { if (/\.woff2?$/.test(request.url())) fonts.push(request.url()); });
    await fixture(page, { me: 'signed-out' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const shift = await page.evaluate(() => (window as Window & { fontShift?: { cls: number; entries: string[] } }).fontShift!);
    const loaded = await page.evaluate(() => [...document.fonts].filter(face => face.status === 'loaded').map(face => `${face.family} ${face.weight}`));
    test.info().annotations.push({ type: 'cls', description: `${shift.cls.toFixed(4)} ${JSON.stringify(shift.entries)}` }, { type: 'fonts', description: JSON.stringify(loaded) });
    expect(fonts.length, 'web fonts were requested and served').toBeGreaterThan(0);
    expect(shift.cls).toBeLessThan(0.02);
  });

// Shipped faces: Bricolage variable (wght 200 to 800), Hanken Grotesk 400 and 600, JetBrains Mono 400 (fonts.scss).
// Any other weight is either resolved to a neighbour or synthesised (faux bold), which R10 found on citation digits.
const shipped: Record<string, (weight: number) => boolean> = {
  'Bricolage Grotesque Variable': weight => weight >= 200 && weight <= 800,
  'Hanken Grotesk': weight => weight === 400 || weight === 600,
  'JetBrains Mono': weight => weight === 400,
};
const weightMismatches = (page: Page) =>
  page.evaluate((families) => {
    const found = new Set<string>();
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const text = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
      if (!text || !element.checkVisibility()) continue;
      const style = getComputedStyle(element);
      const family = style.fontFamily.split(',')[0]!.trim().replace(/^["']|["']$/g, '');
      if (families.includes(family)) found.add(`${family}|${style.fontWeight}|${element.tagName.toLowerCase()}.${element.className.toString().split(' ')[0] ?? ''}`);
    }
    return [...found];
  }, Object.keys(shipped)).then(list =>
    list.filter(entry => { const [family, weight] = entry.split('|'); return !shipped[family!]!(Number(weight)); }));

test('R10: no rendered text asks for a font weight that is not shipped', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize(desktop);
  await fixture(page);
  await askSynthetic(page);
  const mismatches = await weightMismatches(page);
  for (const hash of ['#/', '#/help', '#/auth', '#/sources']) {
    await page.goto(`/${hash}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command menu' })).toBeVisible();
    mismatches.push(...(await weightMismatches(page)).map(entry => `${hash} ${entry}`));
    await page.keyboard.press('Escape');
  }
  expect(mismatches).toEqual([]);
});

const barGeometry = (page: Page) =>
  page.evaluate(() => {
    const form = document.querySelector('main textarea')!.closest('form')!;
    const bar = form.querySelector<HTMLElement>('[class*="_bar_"]')!;
    const send = form.querySelector<HTMLElement>('button[type="submit"]')!.getBoundingClientRect();
    const samples = document.querySelector('[role="group"][aria-label="Sample questions"]')?.getBoundingClientRect();
    return { bar: bar.getBoundingClientRect().height, sendTop: send.top, sendLeft: send.left, samplesTop: samples?.top ?? 0, fits: document.documentElement.scrollWidth <= innerWidth };
  });

test('R2: an 83-character school name truncates in the trigger and the bar stays one row at 1440px', async ({ page }) => {
  expect([...longName]).toHaveLength(83);
  await page.setViewportSize(desktop);
  await fixture(page, { me: 'signed-out', name: 'Synthetic University' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^School: Synthetic University/ })).toBeVisible();
  const short = await barGeometry(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await fixture(page, { me: 'signed-out', name: longName });
  await page.reload();
  const trigger = page.getByRole('button', { name: `School: ${longName}. Change school` });
  await expect(trigger).toHaveAttribute('title', longName);
  const long = await barGeometry(page);
  expect(long.bar).toBe(short.bar);
  expect(long.bar).toBeLessThan(56);
  expect(long.sendTop).toBe(short.sendTop);
  // The name is clipped with an ellipsis rather than pushing the bar onto a second row.
  expect(await trigger.locator('span').first().evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
});

for (const size of [desktop, phone])
  test(`R6: the "Answer in Tiếng Việt?" offer never moves the bar, send or samples at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await fixture(page, { me: 'signed-out', name: longName });
    await page.goto('/');
    const prompt = page.getByLabel('Your question');
    await prompt.fill('Synthetic');
    const before = await barGeometry(page);
    await prompt.pressSequentially(' hạn đăng ký học phần ở đâu?');
    const offer = page.getByRole('button', { name: 'Answer in Tiếng Việt?' });
    await expect(offer).toBeVisible();
    expect(await barGeometry(page)).toEqual(before);
    // It sits on the box edge, above the first line of text, not over it.
    const [offerBox, textBox] = [await offer.boundingBox(), await prompt.boundingBox()];
    expect(offerBox!.y + offerBox!.height).toBeLessThanOrEqual(textBox!.y + 16.5);
    // Still offered, never applied silently; choosing it switches the language.
    await expect(page.getByRole('group', { name: 'Answer language' }).getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    await offer.click();
    await expect(page.getByRole('group', { name: 'Answer language' }).getByRole('button', { name: 'Tiếng Việt' })).toHaveAttribute('aria-pressed', 'true');
    await expect(offer).toHaveCount(0);
  });

test('R3: the reader\'s "Read source passage" disclosure has the turning chevron', async ({ page }) => {
  await page.setViewportSize(desktop);
  await fixture(page);
  await askSynthetic(page);
  await page.getByRole('button', { name: 'Citation 1: open source' }).click();
  await page.getByRole('button', { name: 'Open in reader' }).first().click();
  const summary = page.locator('summary', { hasText: 'Read source passage' });
  await expect(summary).toBeVisible();
  const chevron = summary.locator('svg');
  await expect(chevron).toHaveCount(1);
  const angle = () => chevron.evaluate(element => getComputedStyle(element).transform);
  expect(await angle()).toBe('none');
  await summary.click();
  await expect(summary.locator('xpath=..')).toHaveAttribute('open', '');
  await expect.poll(angle).toMatch(/^matrix\(6\.1\d*e-17, 1, -1, 6\.1\d*e-17|^matrix\(0, 1, -1, 0/);
  await expect(page.getByText('Synthetic full passage.')).toBeVisible();
});

for (const size of [desktop, phone])
  test(`R7: workspace "Ask" lands on #/answer and marks it current at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await fixture(page);
    await page.goto('/#/sources');
    const nav = page.locator(size.width >= 960 ? 'nav[aria-label="Main"]' : 'nav[aria-label="Workspace"]');
    const ask = nav.getByRole('link', { name: 'Ask', exact: true });
    await expect(ask).toHaveAttribute('href', '#/answer');
    await ask.click();
    await expect(page).toHaveURL(/#\/answer$/);
    await expect(page.locator('[data-site-page="home"]')).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Ask', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByLabel('Your question')).toBeVisible();
  });

test('R8: the pilot notice keeps a 44px row at 390px, wrapped or not', async ({ page }) => {
  await page.setViewportSize(phone);
  await fixture(page, { me: 'signed-out' });
  await page.goto('/');
  const notice = page.getByRole('complementary', { name: 'Pilot notice' });
  const text = notice.locator('p');
  await expect(text).toBeVisible();
  const lines = await text.evaluate(element => Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)));
  expect(lines).toBe(2);
  expect((await notice.boundingBox())!.height).toBe(44);
  // One line (a wider phone) gives the same row.
  await page.setViewportSize({ width: 760, height: 844 });
  expect((await notice.boundingBox())!.height).toBe(44);
});

test('R9: #/auth says identity could not be checked when /me fails', async ({ page }) => {
  await page.setViewportSize(desktop);
  await fixture(page, { me: 'outage' });
  await page.goto('/#/auth');
  await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
  await expect(page.getByText('Your account could not be checked right now.')).toBeVisible();
  await expect(page.locator('.site-nav-account')).toHaveText('Account');
  // A plain signed-out visitor gets no such notice.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await fixture(page, { me: 'signed-out' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
  await expect(page.locator('.site-nav-account')).toHaveText('Sign in');
  await expect(page.getByText('Your account could not be checked right now.')).toHaveCount(0);
});

// Review clay-followups.md (two mediums): lazy chunks that fail to download must leave a visible, recoverable state.
test('a route chunk that fails to load shows a reload notice, not an empty page', async ({ page }) => {
  await fixture(page);
  await page.route(/\/assets\/Sources-[^/]+\.js$/, route => route.abort());
  await page.goto('/#/sources');
  await expect(page.getByRole('alert').filter({ hasText: 'This page could not load' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
});

test('a contracts chunk that fails to load gives a visible reload message and sends nothing', async ({ page }) => {
  await fixture(page);
  let posts = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/answers')) posts += 1;
  });
  // Browsers cache a failed module for the page's lifetime, so the honest recovery is a reload, not an in-page retry.
  await page.route(/\/assets\/schemas-[^/]+\.js$/, route => route.abort());
  await page.goto('/');
  await page.getByLabel('Your question').fill('Synthetic question');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Part of the app did not download').first()).toBeVisible();
  await expect(page.getByLabel('Your question')).toHaveValue('Synthetic question');
  expect(posts).toBe(0);
  await page.unroute(/\/assets\/schemas-[^/]+\.js$/);
  await page.reload();
  await expect(page.getByLabel('Your question')).toHaveValue('Synthetic question');
});
