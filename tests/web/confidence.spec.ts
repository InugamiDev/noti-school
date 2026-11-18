import { test, expect, type Locator, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { choose } from './choose';

// intent: confidence-scored, web-sourced evidence in the browser, driven by the frozen contract shapes.
// Every fixture here is synthetic: example.edu and news.example.org are reserved example domains,
// the school does not exist and the confidence numbers are invented for the test.
// status: done | next: none | confidence: high
test.use({ timezoneId: 'Asia/Ho_Chi_Minh' });

const school = '11111111-1111-4111-8111-111111111111';
const space = '99999999-9999-4999-8999-999999999999';
const conversation = '55555555-5555-4555-8555-555555555555';
const answerId = '66666666-6666-4666-8666-666666666666';
const sourceId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const time = '2026-11-18T02:00:00Z';
const fetched = '2026-11-03T08:00:00Z';
const model = 'synthetic-test-model';
const uid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const conf = (overall: number, schoolScore: number, source: number, relevance: number, answers: number) =>
  ({ overall, school: schoolScore, source, relevance, answers, model });

const evidence = (institution: string) => [
  { id: uid(1), institution_id: institution, source_id: sourceId, version_id: versionId, chunk_id: uid(11), title: 'Synthetic handbook', version_label: 'Test edition', locator: { page: 4, section: 'Synthetic section', start_char: 0, end_char: 30 }, quote: 'Synthetic approved passage.', original_url: null, origin: 'approved', domain: null, retrieved_at: null, confidence: conf(0.91, 0.99, 0.97, 0.92, 0.9) },
  { id: uid(2), institution_id: institution, source_id: uid(21), version_id: uid(22), chunk_id: uid(23), title: 'Synthetic registry page', version_label: 'Fetched 2026-11-03', locator: { page: null, section: 'Synthetic notice', start_char: 0, end_char: 30 }, quote: 'Synthetic web passage from the school site.', original_url: 'https://example.edu/registry/synthetic', origin: 'web', domain: 'example.edu', retrieved_at: fetched, confidence: conf(0.72, 0.95, 0.9, 0.7, 0.61) },
  { id: uid(3), institution_id: institution, source_id: uid(31), version_id: uid(32), chunk_id: uid(33), title: 'Synthetic forum thread', version_label: 'Fetched 2026-11-03', locator: { page: null, section: 'Synthetic reply', start_char: 0, end_char: 30 }, quote: 'Synthetic web passage from a forum.', original_url: 'https://news.example.org/forum/synthetic', origin: 'web', domain: 'news.example.org', retrieved_at: fetched, confidence: conf(0.41, 0.62, 0.28, 0.74, 0.38) },
];
const webAnswer = (institution: string, language: string) => {
  const items = evidence(institution);
  return { id: answerId, conversation_id: conversation, institution_id: institution, status: 'qualified', language, claims: items.map((e, i) => ({ text: `Synthetic claim ${i + 1} for testing only.`, evidence_ids: [e.id], confidence: e.confidence.overall })), evidence: items, explanation: 'Synthetic fixture. No provider was called.', confidence: 0.41, created_at: time };
};
const approvedAnswer = (institution: string, language: string) => {
  const [first] = evidence(institution);
  return { id: answerId, conversation_id: conversation, institution_id: institution, status: 'answered', language, claims: [{ text: 'Synthetic approved-only claim.', evidence_ids: [first!.id], confidence: null }], evidence: [{ ...first!, confidence: null }], explanation: null, confidence: null, created_at: time };
};
const webDocument = (institution: string, n: number, domain: string, title: string, state: string, confidence: ReturnType<typeof conf> | null) =>
  ({ id: uid((institution === space ? 300 : 100) + n), institution_id: institution, url: `https://${domain}/synthetic-${n}`, final_url: `https://${domain}/synthetic-${n}`, domain, title, language: 'en', fetched_at: fetched, stale_after: '2026-11-10T08:00:00Z', sha256: String(n).repeat(64), state, source_id: null as string | null, confidence });
const webDocuments = (institution: string) => [
  webDocument(institution, 1, 'example.edu', 'Synthetic registry page', 'fresh', conf(0.88, 0.96, 0.95, 0.9, 0.84)),
  webDocument(institution, 2, 'news.example.org', 'Synthetic campus news', 'stale', conf(0.66, 0.82, 0.55, 0.86, 0.7)),
  webDocument(institution, 3, 'news.example.org', 'Synthetic forum thread', 'fresh', conf(0.41, 0.62, 0.28, 0.74, 0.38)),
];
const savedSource = (institution: string, current: string | null) =>
  ({ id: sourceId, institution_id: institution, title: 'Synthetic registry page', kind: 'url', original_url: 'https://example.edu/synthetic-1', visibility: 'institution', current_version_id: current, created_at: time });
const savedVersion = (institution: string, status: string) =>
  ({ id: versionId, source_id: sourceId, institution_id: institution, label: 'Fetched 2026-11-03', sha256: '1'.repeat(64), status, indexing: 'ready', effective_from: null, effective_until: null, created_at: time });

type Options = {
  admin?: boolean; signedIn?: boolean; discovery?: 'available' | 'disabled'; listSpace?: boolean;
  /** The private space already holds a page its owner saved and chose to use. */
  spaceSaved?: boolean;
  /** Saving a page does not produce its saved copy at once, as with real ingestion. */
  slowSave?: boolean;
  answer?: (institution: string, language: string) => unknown;
};
async function setup(page: Page, options: Options = {}) {
  const state = {
    asks: [] as Record<string, unknown>[],
    actions: [] as { id: string; body: unknown; csrf: string | undefined }[],
    domains: [] as unknown[],
    spaceCreates: [] as { body: string | null; csrf: string | undefined }[],
    approvals: [] as { path: string; body: unknown; csrf: string | undefined; key: string | undefined }[],
    hasSpace: false,
    requests: [] as string[],
    release: undefined as undefined | Promise<void>,
    documents: webDocuments(school),
    spaceDocuments: webDocuments(space),
    // Status of the saved copy in the private space; undefined until a page is saved.
    spaceVersion: (options.spaceSaved ? 'approved' : undefined) as string | undefined,
    schoolDomains: ['example.edu'],
  };
  const fail = (code: string, status: number) => ({ status, json: { error: { code, message: 'Synthetic failure', request_id: school, retryable: false } } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    state.requests.push(`${method} ${path}`);
    const schoolItem = { id: school, slug: 'synthetic', name: 'Synthetic School', kind: 'school', domains: state.schoolDomains, coverage: 'synthetic_demo' };
    const spaceItem = { id: space, slug: 'synthetic-space', name: 'Synthetic personal space', kind: 'personal', domains: [], coverage: 'web_discovery' };
    if (path.endsWith('/capabilities')) {
      const cap = { state: 'available', reason: 'ready' };
      const discovery = options.discovery === 'disabled' ? { state: 'disabled', reason: 'not_configured' } : cap;
      return route.fulfill({ json: { mode: 'mock', answers: cap, indexing: cap, discovery, google: cap, email: cap, identity: cap } });
    }
    if (path.endsWith('/api/v1/institutions')) return route.fulfill({ json: { items: [schoolItem, ...(state.hasSpace && options.listSpace ? [spaceItem] : [])], next_cursor: null } });
    if (path.endsWith('/api/v1/me')) {
      if (options.signedIn === false) return route.fulfill(fail('unauthenticated', 401));
      return route.fulfill({ json: { identity: { user_id: 'synthetic-user', session_id: 'synthetic-session', email_verified: true, expires_at: '2027-01-01T00:00:00Z' }, memberships: [{ institution_id: school, role: options.admin ? 'admin' : 'student' }, ...(state.hasSpace ? [{ institution_id: space, role: 'admin' }] : [])] } });
    }
    if (path.endsWith('/api/v1/me/personal-space') && method === 'POST') {
      state.spaceCreates.push({ body: request.postData(), csrf: request.headers()['x-noti-csrf'] });
      state.hasSpace = true;
      return route.fulfill({ status: 201, json: spaceItem });
    }
    if (path.endsWith('/api/v1/answers') && method === 'POST') {
      const body = request.postDataJSON() as { institution_id: string; language: string };
      state.asks.push(body);
      await state.release;
      return route.fulfill({ json: (options.answer ?? webAnswer)(body.institution_id, body.language) });
    }
    if (path.includes('/citations/')) {
      const institution = path.split('/')[4]!;
      const found = evidence(institution).find((e) => path.endsWith(e.id));
      return found ? route.fulfill({ json: found }) : route.fulfill(fail('not_found', 404));
    }
    const inSpace = path.split('/')[4] === space;
    if (path.endsWith('/web-documents')) return route.fulfill({ json: { items: inSpace ? state.spaceDocuments : state.documents, next_cursor: null } });
    if (path.includes('/web-documents/') && method === 'PATCH') {
      const body = request.postDataJSON() as { action: string };
      const list = inSpace ? state.spaceDocuments : state.documents;
      const document = list.find((d) => path.endsWith(d.id))!;
      state.actions.push({ id: document.id, body, csrf: request.headers()['x-noti-csrf'] });
      if (body.action === 'promote') { document.source_id = sourceId; if (inSpace && !options.slowSave) state.spaceVersion ??= 'pending_review'; }
      if (body.action === 'refresh') Object.assign(document, { state: 'fresh', fetched_at: time });
      if (body.action === 'block') {
        if (inSpace) state.spaceDocuments = list.filter((d) => d !== document);
        else state.documents = list.filter((d) => d !== document);
      }
      return route.fulfill({ json: document });
    }
    // The saved copy in the private space: one source, one version, approved only when asked.
    if (inSpace && path.endsWith(`/sources/${sourceId}/versions`)) return route.fulfill({ json: { items: state.spaceVersion ? [savedVersion(space, state.spaceVersion)] : [], next_cursor: null } });
    if (inSpace && path.endsWith(`/versions/${versionId}/actions`) && method === 'POST') {
      state.approvals.push({ path, body: request.postDataJSON(), csrf: request.headers()['x-noti-csrf'], key: request.headers()['idempotency-key'] });
      state.spaceVersion = 'approved';
      return route.fulfill({ json: { id: uid(400), institution_id: space, version_id: versionId, state: 'succeeded', error_code: null } });
    }
    if (inSpace && path.endsWith('/sources')) return route.fulfill({ json: { items: state.spaceVersion ? [savedSource(space, state.spaceVersion === 'approved' ? versionId : null)] : [], next_cursor: null } });
    if (path.endsWith('/domains') && method === 'PUT') {
      const body = request.postDataJSON() as { domains: string[] };
      state.domains.push(body);
      state.schoolDomains = body.domains;
      return route.fulfill({ json: { ...schoolItem, domains: body.domains } });
    }
    if (path.endsWith('/graph')) return route.fulfill({ json: { items: [{ id: uid(200), institution_id: school, from_entity_id: uid(201), to_entity_id: uid(202), relation: 'synthetic relation', status: 'candidate', confidence: 0.64, evidence: [evidence(school)[2]] }], next_cursor: null } });
    if (path.endsWith('/budget')) return route.fulfill({ json: { month: '2026-11', cap_micro_usd: 50000000, spent_micro_usd: 0, reserved_micro_usd: 0, currency: 'USD' } });
    if (['/conversations', '/answers', '/sources', '/feedback'].some((end) => path.endsWith(end))) return route.fulfill({ json: { items: [], next_cursor: null } });
    return route.fulfill(fail('not_found', 404));
  });
  return state;
}
const question = (page: Page) => page.getByRole('textbox', { name: /^(Your question|Câu hỏi của bạn)$/ });
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
/** The label is real on-screen text: not the 1px screen-reader clip, and wide enough to read. */
async function expectVisibleLabel(label: Locator, text: string) {
  await expect(label.first()).toBeVisible();
  for (const item of await label.all()) {
    await expect(item).toHaveText(text);
    await expect(item).not.toHaveClass(/sr-only/);
    const shown = await item.evaluate((el) => {
      const box = el.getBoundingClientRect(), style = getComputedStyle(el);
      return { width: box.width, height: box.height, clipped: style.clip !== 'auto' || style.clipPath !== 'none', opacity: Number(style.opacity), position: style.position };
    });
    expect(shown.width).toBeGreaterThan(40);
    expect(shown.height).toBeGreaterThan(10);
    expect(shown).toMatchObject({ clipped: false, opacity: 1, position: 'static' });
  }
}
/** Every matched element lies inside the viewport's width: nothing is cut off or pushed off screen. */
async function expectWithinWidth(page: Page, locator: Locator) {
  const width = page.viewportSize()!.width;
  const boxes = await locator.evaluateAll((nodes) => nodes.map((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width }; }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(width + 0.5);
  }
}
async function openSpace(page: Page, label = 'My space') {
  const picker = page.getByRole('combobox', { name: 'Institution' });
  await picker.click();
  await page.getByRole('option', { name: new RegExp(`^${label}`) }).click();
  await expect(picker).toContainText(label);
}
async function ask(page: Page, text = 'Synthetic question') {
  await question(page).fill(text);
  await page.getByRole('button', { name: /^(Ask|Hỏi)$/ }).click();
}

test('each citation names its origin and fetch date and carries a labelled confidence with four parts', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/'); await ask(page);
  const cards = page.locator('.source-list > li');
  await expect(cards).toHaveCount(3);
  // Approved document: no domain, no fetch date.
  await expect(cards.nth(0)).toContainText('Approved document');
  await expect(cards.nth(0)).not.toContainText('Fetched');
  await expect(cards.nth(0).getByRole('button', { name: 'Confidence: High 91%' })).toBeVisible();
  // The word "Confidence" is on screen for sighted readers, not only in the accessible name.
  await expect(page.locator('.confidence-tag .sr-only')).toHaveCount(0);
  for (const card of [cards.nth(0), cards.nth(1), cards.nth(2)]) await expectVisibleLabel(card.locator('.confidence-label'), 'Confidence:');
  // Web pages: domain, fetch date and a worded level beside the number.
  await expect(cards.nth(1)).toContainText('Web page · example.edu');
  await expect(cards.nth(1)).toContainText('Fetched 3 Nov 2026');
  await expect(cards.nth(1)).not.toContainText('Approved document');
  const medium = cards.nth(1).getByRole('button', { name: 'Confidence: Medium 72%' });
  await expect(medium).toHaveAttribute('aria-expanded', 'false');
  await expect(cards.nth(2)).toContainText('Web page · news.example.org');
  await expect(cards.nth(2).getByRole('button', { name: 'Confidence: Low 41%' })).toBeVisible();
  // The level is a word in the DOM, never only a colour.
  await expect(cards.nth(2).locator('.confidence-tag')).toHaveAttribute('data-level', 'low');
  await expect(cards.nth(2).locator('.confidence-word')).toHaveText('Low');
  // Expanding explains the four parts in plain words.
  await medium.click();
  await expect(medium).toHaveAttribute('aria-expanded', 'true');
  const parts = cards.nth(1).getByRole('group', { name: 'What the confidence is based on' });
  await expect(parts.getByRole('listitem')).toHaveText([/About this school\s*95%/, /Trusted source\s*90%/, /On topic\s*70%/, /Answers the question\s*61%/]);
  await expect(parts).toContainText(`Scored by ${model}`);
  await medium.click();
  await expect(parts).toBeHidden();
  // A web passage opens without pretending to be a library document.
  await page.getByRole('button', { name: 'Open source citation 3' }).click();
  const reader = page.getByRole('article', { name: 'Source citation' });
  await expect(reader).toContainText('Found on the web. This page is not an approved document.');
  await expect(reader).toContainText('Fetched 3 Nov 2026');
  await expect(reader.getByRole('link', { name: 'Open web page' })).toHaveAttribute('href', 'https://news.example.org/forum/synthetic');
  await expect(reader.getByRole('link', { name: /Open original/ })).toHaveCount(0);
  expect(state.requests.some((r) => /\/(versions|chunks)\//.test(r))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the answer header states overall confidence in a sentence and notes unreviewed web pages', async ({ page }) => {
  await setup(page);
  await page.goto('/'); await ask(page);
  const header = page.locator('.answer-confidence');
  await expect(header).toContainText('Confidence: Low 41%');
  await expect(header).toContainText('The cited sources give weak support. Treat this as a lead and check the sources.');
  await expect(page.getByRole('note')).toHaveText('Includes pages found on the web. They have not been reviewed by Synthetic School staff.');
  await expectVisibleLabel(header.locator('.confidence-label'), 'Confidence:');
  // Claims carry their own confidence quietly, in words as well as numbers, with the visible label.
  await expect(page.locator('.claim .claim-confidence')).toHaveText(['Confidence: High 91%', 'Confidence: Medium 72%', 'Confidence: Low 41%']);
  for (const label of await page.locator('.claim .confidence-label').all()) await expectVisibleLabel(label, 'Confidence:');
});

test('approved-only and unscored answers show no web notice and never invent a score', async ({ page }) => {
  await setup(page, { answer: approvedAnswer });
  await page.goto('/'); await ask(page);
  await expect(page.locator('.claim')).toContainText('Synthetic approved-only claim.');
  await expect(page.getByRole('note')).toHaveCount(0);
  await expect(page.locator('.answer-confidence')).toHaveCount(0);
  await expect(page.locator('.claim-confidence')).toHaveCount(0);
  await expect(page.locator('.source-list > li')).toContainText('Approved document');
  await expect(page.locator('.source-list > li')).toContainText('Confidence: Not scored');
  await expectVisibleLabel(page.locator('.source-list > li .confidence-label'), 'Confidence:');
});

test('asking sends discover: true by default and says it is searching the web', async ({ page }) => {
  const state = await setup(page);
  let release!: () => void;
  state.release = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/'); await ask(page);
  await expect.poll(() => state.asks.length).toBe(1);
  expect(state.asks[0]).toMatchObject({ institution_id: school, question: 'Synthetic question', language: 'en', discover: true });
  // Owner decision: web search is on by default whenever discovery is available; there is no opt-in control.
  await expect(page.locator('form.composer').getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('form.composer').getByRole('switch')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Searching approved documents and the web…' })).toBeVisible();
  release();
  await expect(page.locator('.claim')).toHaveCount(3);
  await expect(page.getByText('Searching approved documents and the web…')).toHaveCount(0);
  expect(state.asks.length).toBe(1);
});

test('a server that reports discovery as unavailable gets discover: false and no web-search claim', async ({ page }) => {
  const state = await setup(page, { discovery: 'disabled', answer: approvedAnswer });
  let release!: () => void;
  state.release = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/'); await ask(page);
  await expect.poll(() => state.asks.length).toBe(1);
  expect(state.asks[0]).toMatchObject({ discover: false });
  await expect(page.getByRole('status').filter({ hasText: 'Finding an answer and its sources…' })).toBeVisible();
  await expect(page.getByText('Searching approved documents and the web…')).toHaveCount(0);
  release();
  await expect(page.locator('.claim')).toHaveCount(1);
});

test('admin web pages: promote, refresh and block send the frozen actions, and block asks first', async ({ page }) => {
  const state = await setup(page, { admin: true });
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Web pages', exact: true })).toBeVisible();
  const row = (title: string) => page.getByRole('article', { name: title });
  const registry = row('Synthetic registry page'), news = row('Synthetic campus news'), forum = row('Synthetic forum thread');
  await expect(registry).toContainText('example.edu · Fetched 3 Nov 2026');
  await expect(registry.locator('.admin-chip')).toHaveText(['Fresh']);
  await expect(registry.getByRole('button', { name: 'Confidence: High 88%' })).toBeVisible();
  for (const item of [registry, news, forum]) await expectVisibleLabel(item.locator('.confidence-label'), 'Confidence:');
  await expect(news.locator('.admin-chip')).toHaveText(['Stale']);
  await expect(news).toContainText('A stale page is fetched again the next time it is used.');
  await expect(forum.getByRole('button', { name: 'Confidence: Low 41%' })).toBeVisible();

  await registry.getByRole('button', { name: 'Promote' }).click();
  await expect.poll(() => state.actions.length).toBe(1);
  expect(state.actions[0]).toEqual({ id: state.documents[0]!.id, body: { action: 'promote' }, csrf: '1' });
  await expect(page.locator('.admin-message')).toHaveText('Page promoted. It now waits for review as a document and is not approved yet.');
  await expect(registry.locator('.admin-chip')).toHaveText(['Fresh', 'Sent for review']);
  await expect(registry.getByRole('link', { name: 'View document' })).toHaveAttribute('href', `#/sources/${sourceId}`);
  await expect(registry.getByRole('button', { name: 'Promote' })).toHaveCount(0);

  await news.getByRole('button', { name: 'Refresh' }).click();
  await expect.poll(() => state.actions.length).toBe(2);
  expect(state.actions[1]).toMatchObject({ id: state.documents[1]!.id, body: { action: 'refresh' } });
  await expect(news.locator('.admin-chip')).toHaveText(['Fresh']);

  // Block is confirmed inline; choosing Keep sends nothing.
  const forumId = state.documents[2]!.id;
  await forum.getByRole('button', { name: 'Block', exact: true }).click();
  const confirm = forum.getByRole('group', { name: 'Confirm block' });
  await expect(confirm).toContainText('Block this page? It will no longer be used in answers.');
  await expect(confirm.getByRole('button', { name: 'Keep' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Keep' }).click();
  await expect(confirm).toHaveCount(0);
  expect(state.actions.length).toBe(2);
  await forum.getByRole('button', { name: 'Block', exact: true }).click();
  await forum.getByRole('button', { name: 'Block page' }).click();
  await expect.poll(() => state.actions.length).toBe(3);
  expect(state.actions[2]).toEqual({ id: forumId, body: { action: 'block' }, csrf: '1' });
  await expect(forum).toHaveCount(0);
  await expect(page.locator('.admin-message')).toHaveText('Page blocked. It will not be used in answers.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('admin school domains are replaced with PUT, and graph relations show their confidence', async ({ page }) => {
  const state = await setup(page, { admin: true });
  await page.goto('/#/admin');
  const field = page.getByLabel('Domains, one per line');
  await expect(field).toHaveValue('example.edu');
  // A URL is not a domain: refused before any request.
  await field.fill('https://example.edu/path');
  await page.getByRole('button', { name: 'Save domains' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enter 1 to 20 domain names' })).toBeVisible();
  expect(state.domains).toEqual([]);
  await field.fill('example.edu\nLibrary.Example.edu');
  const sent = page.waitForRequest((r) => r.url().endsWith('/domains') && r.method() === 'PUT');
  await page.getByRole('button', { name: 'Save domains' }).click();
  expect((await sent).headers()['x-noti-csrf']).toBe('1');
  expect(state.domains).toEqual([{ domains: ['example.edu', 'library.example.edu'] }]);
  await expect(page.locator('.admin-message')).toHaveText('Domains saved.');
  await expect(field).toHaveValue('example.edu\nlibrary.example.edu');
  // The accepted format is explained next to the field, and a Unicode name is sent in its ASCII form.
  await expect(field).toHaveAccessibleDescription(/bare name such as example\.edu, without https:\/\/ or a path\..*trường\.example.*xn--trng-rib8295b\.example/);
  await expect(page.getByText('is saved in its ASCII form', { exact: false })).toBeVisible();
  await field.fill('example.edu\ntrường.example\nTRƯỜNG.example');
  await page.getByRole('button', { name: 'Save domains' }).click();
  await expect.poll(() => state.domains.length).toBe(2);
  expect(state.domains[1]).toEqual({ domains: ['example.edu', 'xn--trng-rib8295b.example'] });
  await expect(field).toHaveValue('example.edu\nxn--trng-rib8295b.example');
  // An address with a port or an IP literal is still refused, with the format spelled out.
  await field.fill('192.168.1.1');
  await page.getByRole('button', { name: 'Save domains' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Names with accented letters are accepted.' })).toBeVisible();
  expect(state.domains.length).toBe(2);
  await field.fill('example.edu');
  await page.getByRole('button', { name: 'Save domains' }).click();
  await expect.poll(() => state.domains.length).toBe(3);

  await page.getByText('Evidence graph administration', { exact: true }).click();
  const edge = page.locator('.admin-disclosure-body .admin-version');
  await expect(edge.locator('.confidence-tag')).toHaveText('Confidence: Medium 64%');
  await expect(edge).toContainText('Web page · news.example.org');
  await expect(edge.getByRole('link', { name: 'Synthetic forum thread' })).toHaveAttribute('href', 'https://news.example.org/forum/synthetic');
});

test('students never load or see the cached web pages', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Web pages', exact: true })).toHaveCount(0);
  expect(state.requests.some((r) => r.includes('/web-documents') || r.includes('/domains'))).toBe(false);
});

test('My space: the first choice creates the private space once, then questions are asked inside it', async ({ page }) => {
  const state = await setup(page);
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Institution' });
  await expect(picker).toContainText('Synthetic School');
  await picker.click();
  const entry = page.getByRole('option', { name: /^My space/ });
  await expect(entry).toContainText('Private to you');
  await entry.click();
  await expect(picker).toContainText('My space');
  expect(state.spaceCreates).toEqual([{ body: null, csrf: '1' }]);
  await expect(page.getByText('My space is private to you.', { exact: false })).toBeVisible();
  await ask(page, 'Synthetic private question');
  await expect.poll(() => state.asks.length).toBe(1);
  expect(state.asks[0]).toMatchObject({ institution_id: space, question: 'Synthetic private question', discover: true });
  await expect(page.locator('.claim')).toHaveCount(3);
  // A private space has no staff: the notice names nobody as a reviewer.
  await expect(page.getByRole('note')).toHaveText('Includes pages found on the web. Nobody has reviewed them.');
  await expect(page.locator('.thread-meta')).toContainText('My space');
  // Nobody approves anything in a private space: a kept page reads "Saved by you", on the card and in the reader.
  const cards = page.locator('.source-list > li');
  await expect(cards.nth(0)).toContainText('Saved by you');
  await expect(cards.nth(1)).toContainText('Web page · example.edu');
  await expect(page.locator('main')).not.toContainText('Approved document');
  await page.getByRole('button', { name: 'Open source citation 1' }).click();
  const reader = page.getByRole('article', { name: 'Source citation' });
  await expect(reader).toContainText('Saved by you');
  await expect(reader).not.toContainText('Approved document');
  await page.getByRole('button', { name: 'Close passage' }).click();
  // Returning and choosing it again reuses the space: no second create call.
  await page.getByRole('link', { name: '← New question' }).click();
  await choose(picker, 'Synthetic School · Demo');
  await expect(picker).toContainText('Synthetic School');
  await picker.click();
  await page.getByRole('option', { name: /^My space/ }).click();
  await expect(picker).toContainText('My space');
  expect(state.spaceCreates.length).toBe(1);
});

test('My space listed by the server is reused after a reload without another create call', async ({ page }) => {
  const state = await setup(page, { listSpace: true });
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Institution' });
  await picker.click();
  await page.getByRole('option', { name: /^My space/ }).click();
  await expect(picker).toContainText('My space');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Institution' })).toContainText('My space');
  expect(state.spaceCreates.length).toBe(1);
});

test('My space needs a signed-in reader: signed out, nothing is created', async ({ page }) => {
  const state = await setup(page, { signedIn: false });
  await page.goto('/');
  const picker = page.getByRole('combobox', { name: 'Institution' });
  await picker.click();
  const entry = page.getByRole('option', { name: /^My space/ });
  await expect(entry).toContainText('Sign in to use');
  await entry.click();
  const note = page.getByRole('status').filter({ hasText: 'Sign in to open your private space.' });
  await expect(note).toBeVisible();
  await expect(note.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '#/auth');
  await expect(picker).toContainText('Synthetic School');
  expect(state.spaceCreates).toEqual([]);
});

test('Vietnamese labels: confidence, origin, notice, waiting text, picker and admin web pages', async ({ page }) => {
  const state = await setup(page, { admin: true });
  let release!: () => void;
  state.release = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/');
  await choose(page.getByLabel('Answer language'), 'Tiếng Việt');
  await page.getByRole('combobox', { name: 'Institution' }).click();
  const entry = page.getByRole('option', { name: /^Không gian của tôi/ });
  await expect(entry).toContainText('Chỉ mình bạn thấy');
  await page.keyboard.press('Escape');
  await ask(page, 'Câu hỏi thử nghiệm');
  await expect(page.getByRole('status').filter({ hasText: 'Đang tìm trong tài liệu đã duyệt và trên web…' })).toBeVisible();
  release();
  await expect(page.locator('.answer-confidence')).toContainText('Độ tin cậy: Thấp 41%');
  await expect(page.locator('.answer-confidence')).toContainText('Các nguồn trích dẫn hỗ trợ yếu.');
  await expect(page.getByRole('note')).toHaveText('Có dùng các trang tìm thấy trên web. Nhân viên Synthetic School chưa kiểm duyệt các trang này.');
  const cards = page.locator('.source-list > li');
  await expect(cards.nth(0)).toContainText('Tài liệu đã duyệt');
  await expect(cards.nth(1)).toContainText('Trang web · example.edu');
  await expect(cards.nth(1)).toContainText('Tải về ngày 3 thg 11, 2026');
  await cards.nth(1).getByRole('button', { name: 'Độ tin cậy: Trung bình 72%' }).click();
  await expect(cards.nth(1).getByRole('group', { name: 'Độ tin cậy dựa trên điều gì' }).getByRole('listitem'))
    .toHaveText([/Nói về trường này\s*95%/, /Nguồn đáng tin\s*90%/, /Đúng chủ đề\s*70%/, /Trả lời được câu hỏi\s*61%/]);
  await expect(page.locator('.claim .claim-confidence').first()).toHaveText('Độ tin cậy: Cao 91%');

  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Trang web', exact: true })).toBeVisible();
  const forum = page.getByRole('article', { name: 'Synthetic forum thread' });
  await expect(forum.locator('.admin-chip')).toHaveText(['Còn mới']);
  await expect(forum).toContainText('Tải về ngày 3 thg 11, 2026');
  await expect(forum.getByRole('button', { name: 'Đưa vào duyệt' })).toBeVisible();
  await expect(forum.getByRole('button', { name: 'Tải lại' })).toBeVisible();
  await forum.getByRole('button', { name: 'Chặn', exact: true }).click();
  await expect(forum.getByRole('group', { name: 'Xác nhận chặn' })).toContainText('Chặn trang này?');
  await expect(page.getByLabel('Tên miền, mỗi dòng một tên')).toHaveValue('example.edu');
  await expect(page.getByRole('heading', { name: 'Tên miền của trường' })).toBeVisible();
});

test('My space waiting line says only the web is searched, in English and Vietnamese', async ({ page }) => {
  const state = await setup(page);
  let release!: () => void;
  state.release = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/');
  await openSpace(page);
  await ask(page, 'Synthetic private question');
  await expect.poll(() => state.asks.length).toBe(1);
  expect(state.asks[0]).toMatchObject({ institution_id: space, discover: true });
  // A new private space has no documents, so the line never claims to search approved ones.
  await expect(page.getByRole('status').filter({ hasText: /^Searching the web…$/ })).toBeVisible();
  await expect(page.getByText('approved documents', { exact: false })).toHaveCount(0);
  release();
  await expect(page.locator('.claim')).toHaveCount(3);
  await expect(page.getByText('Searching the web…')).toHaveCount(0);

  state.release = new Promise<void>((resolve) => { release = resolve; });
  await page.getByRole('link', { name: '← New question' }).click();
  await choose(page.getByLabel('Answer language'), 'Tiếng Việt');
  await ask(page, 'Câu hỏi riêng thử nghiệm');
  await expect(page.getByRole('status').filter({ hasText: /^Đang tìm trên web…$/ })).toBeVisible();
  await expect(page.getByText('tài liệu đã duyệt', { exact: false })).toHaveCount(0);
  release();
  await expect(page.locator('.claim')).toHaveCount(3);
});

test('My space with a saved page in use says it searches saved pages and the web', async ({ page }) => {
  const state = await setup(page, { spaceSaved: true });
  let release!: () => void;
  state.release = new Promise<void>((resolve) => { release = resolve; });
  await page.goto('/');
  await openSpace(page);
  await expect.poll(() => state.requests.includes(`GET /api/v1/institutions/${space}/sources`)).toBe(true);
  await ask(page, 'Synthetic private question');
  await expect(page.getByRole('status').filter({ hasText: /^Searching your saved pages and the web…$/ })).toBeVisible();
  await expect(page.getByText('approved documents', { exact: false })).toHaveCount(0);
  release();
  await expect(page.locator('.claim')).toHaveCount(3);
  // A space where discovery cannot run makes no web claim at all.
  expect(state.asks[0]).toMatchObject({ institution_id: space, discover: true });
});

test('My space manager: saved pages only, Save then Use in answers, and none of the school console', async ({ page }) => {
  // The reader administers a school too, so the school console exists for them; the space never shows it.
  const state = await setup(page, { admin: true });
  await page.goto('/');
  await openSpace(page);
  await page.goto('/#/admin');
  const main = page.locator('main');
  await expect(page.getByRole('heading', { level: 1, name: 'My space' })).toBeVisible();
  await expect(page).toHaveTitle('My space — noti.school');
  await expect(main).toContainText('Pages found on the web for your questions. Save a page to keep it, or block it so it is not used again.');
  await expect(main).toContainText('Nobody has reviewed them. A page you save is labelled Saved by you.');
  // No school console: no domains editor, budget, student feedback, document flow or graph tools.
  for (const name of ['Collection management', 'School domains', 'Monthly AI budget', 'Feedback', 'Existing documents', 'Add document'])
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Domains, one per line')).toHaveCount(0);
  await expect(page.getByRole('meter')).toHaveCount(0);
  await expect(page.getByText('Evidence graph administration')).toHaveCount(0);
  await expect(main).not.toContainText(/official|approved|students|\$\d|Promote|Sent for review/i);

  const row = (title: string) => page.getByRole('article', { name: title });
  const registry = row('Synthetic registry page'), forum = row('Synthetic forum thread');
  await expect(page.locator('.web-page')).toHaveCount(3);
  await expect(registry).toContainText('example.edu · Fetched 3 Nov 2026');
  await expect(registry.getByRole('button', { name: 'Confidence: High 88%' })).toBeVisible();
  await expect(registry.locator('.admin-chip')).toHaveText(['Fresh']);

  // Save sends the frozen promote action and approves nothing by itself.
  await registry.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => state.actions.length).toBe(1);
  expect(state.actions[0]).toEqual({ id: state.spaceDocuments[0]!.id, body: { action: 'promote' }, csrf: '1' });
  await expect(page.locator('.admin-message')).toHaveText('Page saved. Read the saved copy, then choose Use in answers.');
  await expect(registry.locator('.admin-chip')).toHaveText(['Fresh', 'Saved by you']);
  await expect(registry.getByRole('link', { name: 'View saved copy' })).toHaveAttribute('href', `#/sources/${sourceId}`);
  await expect(registry.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(registry).toContainText('Not used in your answers yet. Read the saved copy first.');
  expect(state.approvals).toEqual([]);

  // Using it is the owner's own explicit choice: the ordinary approve action, sent once.
  await registry.getByRole('button', { name: 'Use in answers' }).click();
  await expect.poll(() => state.approvals.length).toBe(1);
  expect(state.approvals[0]).toMatchObject({ path: `/api/v1/institutions/${space}/versions/${versionId}/actions`, body: { action: 'approve', expected_status: 'pending_review' }, csrf: '1' });
  expect(state.approvals[0]!.key).toMatch(/^[a-f0-9-]{36}$/);
  await expect(page.locator('.admin-message')).toHaveText('Done. This page can now support your answers, labelled Saved by you.');
  await expect(registry).toContainText('Used in your answers.');
  await expect(registry.getByRole('button', { name: 'Use in answers' })).toHaveCount(0);
  await expect(main).not.toContainText(/official|approved|students|\$\d|Promote|Sent for review/i);

  // Block still asks first.
  const forumId = state.spaceDocuments[2]!.id;
  await forum.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(forum.getByRole('group', { name: 'Confirm block' }).getByRole('button', { name: 'Keep' })).toBeFocused();
  await forum.getByRole('button', { name: 'Block page' }).click();
  await expect.poll(() => state.actions.length).toBe(2);
  expect(state.actions[1]).toEqual({ id: forumId, body: { action: 'block' }, csrf: '1' });
  await expect(forum).toHaveCount(0);

  // The application budget, other people's reports, domains and the graph were never requested.
  expect(state.requests.filter((r) => /\/(budget|feedback|domains|graph)(\/|$)/.test(r))).toEqual([]);
  expect(state.domains).toEqual([]);
  expect(await noOverflow(page)).toBe(true);

  // Back in the school, the full console is unchanged.
  await page.goto('/');
  await choose(page.getByRole('combobox', { name: 'Institution' }), 'Synthetic School · Demo');
  await page.goto('/#/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Collection management' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'School domains' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Monthly AI budget' })).toBeVisible();
  await expect(page).toHaveTitle('Collection administration — noti.school');
});

test('My space manager survives a reload and is honest while a saved copy is not ready', async ({ page }) => {
  const state = await setup(page, { admin: true, listSpace: true, slowSave: true });
  await page.goto('/');
  await openSpace(page);
  await page.goto('/#/admin');
  // Reloading at once cuts the session refresh short. That is not a sign-out, so My space stays selected.
  await page.reload();
  // A cold load of the management address with the space selected still never opens the school console.
  await expect(page.getByRole('heading', { level: 1, name: 'My space' })).toBeVisible();
  await expect(page.locator('.web-page')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Monthly AI budget' })).toHaveCount(0);
  expect(state.requests.filter((r) => /\/(budget|feedback|domains|graph)(\/|$)/.test(r))).toEqual([]);

  const registry = page.getByRole('article', { name: 'Synthetic registry page' });
  await registry.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(registry.locator('.admin-chip')).toHaveText(['Fresh', 'Saved by you']);
  // No saved copy exists yet: nothing can be approved, and the row says so instead of pretending.
  await expect(registry).toContainText('The saved copy is not ready yet.');
  await expect(registry.getByRole('button', { name: 'Use in answers' })).toHaveCount(0);
  state.spaceVersion = 'pending_review';
  await registry.getByRole('button', { name: 'Check again' }).click();
  await expect(registry).toContainText('Not used in your answers yet. Read the saved copy first.');
  await expect(registry.getByRole('button', { name: 'Use in answers' })).toBeVisible();
  expect(state.approvals).toEqual([]);
});

test('landing and help say where answers come from, in English and Vietnamese, without an approved-only promise', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  const story = page.locator('.site-story .story-copy');
  await expect(story.getByRole('heading', { name: 'From question to source in four steps.' })).toBeVisible();
  await expect(story.getByRole('listitem')).toHaveText([
    /Ask the way you speak/,
    /Reviewed documents first\s*noti\.school checks your school’s reviewed documents first, then pages from the web\./,
    /Every part shows its source\s*Every answer shows where each part came from and how sure it is\. Web pages are labelled and never shown as approved\./,
    /Honest about gaps/,
  ]);
  const home = page.locator('[data-site-page="home"]');
  await expect(home).not.toContainText(/Only approved documents|nothing else/i);
  // With My space selected the page must not promise approved-only answers beside the web notice.
  await openSpace(page);
  await expect(page.getByText('My space is private to you.', { exact: false })).toBeVisible();
  await expect(home).not.toContainText(/Only approved documents|nothing else/i);
  const faq = home.locator('.site-faq details').filter({ hasText: 'Where do answers come from?' });
  await faq.locator('summary').click();
  await expect(faq.locator('p')).toHaveText('noti.school checks your school’s reviewed documents first, then pages from the web. Every answer shows where each part came from and how sure it is. Web pages are labelled and never shown as approved.');

  // The same statement follows the language chosen in the composer.
  await choose(page.getByLabel('Answer language'), 'Tiếng Việt');
  await expect(story).toHaveAttribute('lang', 'vi');
  await expect(story.getByRole('heading', { name: 'Từ câu hỏi đến nguồn trong bốn bước.' })).toBeVisible();
  await expect(story.getByRole('listitem').nth(1)).toContainText('noti.school tìm trong các tài liệu đã duyệt của trường bạn trước, sau đó đến các trang trên web.');
  await expect(story.getByRole('listitem').nth(2)).toContainText('Trang web luôn được ghi nhãn và không bao giờ hiển thị như tài liệu đã duyệt.');
  await page.goto('/#/help');
  const help = page.locator('[data-site-page="help"] details').filter({ hasText: 'Câu trả lời lấy từ đâu?' });
  await expect(help).toHaveAttribute('lang', 'vi');
  await help.locator('summary').click();
  await expect(help.locator('p')).toContainText('Mỗi câu trả lời cho biết từng phần lấy từ đâu và chắc chắn đến mức nào.');
  await expect(page.locator('main')).not.toContainText(/[–—]/);
  expect(await noOverflow(page)).toBe(true);
});

// 390x844: the narrow layout, with every breakdown open, in both languages.
const narrow = {
  en: { language: undefined, label: 'Confidence:', tags: ['Confidence: High 91%', 'Confidence: Medium 72%', 'Confidence: Low 41%'], origins: ['Approved document', 'Web page · example.edu', 'Web page · news.example.org'], fetched: 'Fetched 3 Nov 2026', group: 'What the confidence is based on', parts: [/About this school\s*95%/, /Trusted source\s*90%/, /On topic\s*70%/, /Answers the question\s*61%/], notice: 'Includes pages found on the web. They have not been reviewed by Synthetic School staff.', pages: 'Web pages', adminTag: 'Confidence: High 88%', hint: 'is saved in its ASCII form', space: 'My space', save: 'Save', saved: 'Saved by you', waiting: 'Searching the web…', privateQuestion: 'Synthetic narrow private question' },
  vi: { language: 'Tiếng Việt', label: 'Độ tin cậy:', tags: ['Độ tin cậy: Cao 91%', 'Độ tin cậy: Trung bình 72%', 'Độ tin cậy: Thấp 41%'], origins: ['Tài liệu đã duyệt', 'Trang web · example.edu', 'Trang web · news.example.org'], fetched: 'Tải về ngày 3 thg 11, 2026', group: 'Độ tin cậy dựa trên điều gì', parts: [/Nói về trường này\s*95%/, /Nguồn đáng tin\s*90%/, /Đúng chủ đề\s*70%/, /Trả lời được câu hỏi\s*61%/], notice: 'Có dùng các trang tìm thấy trên web. Nhân viên Synthetic School chưa kiểm duyệt các trang này.', pages: 'Trang web', adminTag: 'Độ tin cậy: Cao 88%', hint: 'được lưu ở dạng ASCII', space: 'Không gian của tôi', save: 'Lưu', saved: 'Bạn đã lưu', waiting: 'Đang tìm trên web…', privateQuestion: 'Câu hỏi riêng thử nghiệm trên màn hình hẹp' },
} as const;
for (const [lang, copy] of Object.entries(narrow)) {
  test(`390x844 ${lang}: answer, open breakdowns, admin rows and My space fit without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await setup(page, { admin: true });
    await page.goto('/');
    if (copy.language) await choose(page.getByLabel('Answer language'), copy.language);
    await ask(page, 'Synthetic narrow question');
    const cards = page.locator('.source-list > li');
    await expect(cards).toHaveCount(3);
    expect(await noOverflow(page)).toBe(true);

    // Header, notice and claims: labelled confidence on screen, inside the viewport.
    await expect(page.locator('.answer-confidence .confidence-tag')).toHaveText(copy.tags[2]);
    await expect(page.getByRole('note')).toHaveText(copy.notice);
    await expect(page.locator('.claim .claim-confidence')).toHaveText([...copy.tags]);
    await expectVisibleLabel(page.locator('.turn-answer .confidence-label'), copy.label);
    await expectWithinWidth(page, page.locator('.answer-confidence, .web-notice, .claim, .claim .claim-confidence'));

    // Source cards stack under the answer; each names its origin and carries the visible label.
    for (let i = 0; i < 3; i++) {
      await expect(cards.nth(i)).toContainText(copy.origins[i]!);
      await expect(cards.nth(i).locator('.confidence-tag')).toHaveText(copy.tags[i]!);
    }
    await expect(cards.nth(1)).toContainText(copy.fetched);
    await expectVisibleLabel(cards.locator('.confidence-label'), copy.label);
    const answerBox = (await page.locator('.answer-column').boundingBox())!, asideBox = (await page.locator('.workspace > aside').boundingBox())!;
    expect(asideBox.y).toBeGreaterThanOrEqual(answerBox.y + answerBox.height - 1);

    // Every breakdown open at once: four worded parts each, nothing wider than the screen.
    for (const toggle of await cards.locator('.confidence-toggle').all()) {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    }
    const groups = cards.getByRole('group', { name: copy.group });
    await expect(groups).toHaveCount(3);
    await expect(groups.nth(1).getByRole('listitem')).toHaveText([...copy.parts]);
    await expect(groups.nth(1)).toContainText(model);
    for (const group of await groups.all()) await expect(group).toBeVisible();
    await expectWithinWidth(page, cards.locator('.source-citation, .source-meta, .origin-tag, .confidence-tag, .confidence-parts, .confidence-parts li, .confidence-part-value, .confidence-model'));
    // Name, meter and value share a row without overlapping.
    const rows = await groups.nth(1).getByRole('listitem').evaluateAll((items) => items.map((li) => [...li.children].map((child) => { const r = child.getBoundingClientRect(); return { left: r.left, right: r.right }; })));
    for (const row of rows) for (let i = 1; i < row.length; i++) expect(row[i]!.left).toBeGreaterThanOrEqual(row[i - 1]!.right - 0.5);
    expect(await noOverflow(page)).toBe(true);

    // The web passage reader on a phone.
    await page.getByRole('button', { name: 'Open source citation 3' }).click();
    const reader = page.getByRole('article', { name: 'Source citation' });
    await expect(reader.locator('.confidence-tag')).toHaveText(copy.tags[2]);
    await reader.locator('.confidence-toggle').click();
    await expect(reader.getByRole('group', { name: copy.group })).toBeVisible();
    await expectWithinWidth(page, reader.locator('.source-meta, .confidence-tag, .confidence-parts, .web-notice'));
    expect(await noOverflow(page)).toBe(true);

    // School console rows at the same width, breakdown open.
    await page.goto('/#/admin');
    await expect(page.getByRole('heading', { name: copy.pages, exact: true })).toBeVisible();
    const registry = page.getByRole('article', { name: 'Synthetic registry page' });
    await registry.getByRole('button', { name: copy.adminTag }).click();
    await expect(registry.getByRole('group', { name: copy.group })).toBeVisible();
    await expectVisibleLabel(page.locator('.web-page .confidence-label'), copy.label);
    await expect(page.getByText(copy.hint, { exact: false })).toBeVisible();
    await expectWithinWidth(page, page.locator('.web-page, .web-page .confidence-tag, .web-page .confidence-parts:not([hidden]), .web-page .actions > *, .admin-domains, .admin-domains-hint, .admin-domains textarea'));
    expect(await noOverflow(page)).toBe(true);

    // My space at the same width: its own waiting line and its small manager.
    await page.goto('/');
    await openSpace(page, copy.space);
    let release!: () => void;
    state.release = new Promise<void>((resolve) => { release = resolve; });
    // The composer follows the language of what is typed, so each run asks in its own language.
    await ask(page, copy.privateQuestion);
    await expect(page.getByRole('status').filter({ hasText: copy.waiting })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    release();
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(0)).toContainText(copy.saved);
    await page.goto('/#/admin');
    await expect(page.getByRole('heading', { level: 1, name: copy.space })).toBeVisible();
    const spaceRow = page.getByRole('article', { name: 'Synthetic registry page' });
    await spaceRow.getByRole('button', { name: copy.save, exact: true }).click();
    await expect(spaceRow.locator('.admin-chip').last()).toHaveText(copy.saved);
    await spaceRow.locator('.confidence-toggle').click();
    await expectWithinWidth(page, page.locator('.web-page, .web-page .actions > *, .saved-use, .saved-use > *, .web-page .confidence-parts:not([hidden])'));
    expect(await noOverflow(page)).toBe(true);
  });
}
