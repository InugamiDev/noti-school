import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
const institution = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const evidenceId = '44444444-4444-4444-8444-444444444444';
const time = '2026-09-25T00:00:00Z';
const evidence = { id: evidenceId, institution_id: institution, source_id: sourceId, version_id: versionId, chunk_id: institution, title: 'Synthetic cited document', version_label: 'Review v1', locator: { page: 2, section: 'Synthetic section', start_char: 0, end_char: 20 }, quote: 'Current evidence <img src=x onerror=alert(1)>', original_url: 'https://example.test/original' };
const answer = (text = 'PRIVATE A ANSWER') => ({ id: institution, conversation_id: institution, institution_id: institution, language: 'en', status: 'qualified', claims: [{ text, evidence_ids: [evidenceId] }], evidence: [evidence], explanation: 'Synthetic evidence only.', created_at: time });
const feedback = { id: institution, institution_id: institution, answer_id: institution, category: 'incorrect', evidence_id: null, comment: 'Synthetic report', status: 'open', created_at: time };
const source = { id: sourceId, institution_id: institution, title: 'PRIVATE SOURCE A', kind: 'text', original_url: null, visibility: 'institution', current_version_id: versionId, created_at: time };
const version = { id: versionId, institution_id: institution, source_id: sourceId, label: 'Review v1', sha256: 'a'.repeat(64), status: 'pending_review', indexing: 'ready', effective_from: null, effective_until: null, created_at: time };
const error = (code = 'forbidden') => ({ error: { code, message: 'Synthetic failure', request_id: institution, retryable: false } });
async function fixture(page: Page, admin = false, initial: string | null = 'A') {
  const state = { user: initial, member: true, admin, contextFails: false, emptyChunks: false, mutations: [] as string[] };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
    let value: unknown;
    if (path.endsWith('/capabilities')) { const cap = { state: 'available', reason: 'ready' }; value = { mode: 'mock', answers: cap, indexing: cap, discovery: cap, google: cap, email: cap, identity: cap }; }
    else if (path.endsWith('/institutions')) value = { items: [{ id: institution, name: 'Synthetic institution', slug: 'synthetic', coverage: 'synthetic_demo' }], next_cursor: null };
    else if (path.endsWith('/me')) {
      if (!state.user) return route.fulfill({ status: 401, json: error('unauthenticated') });
      value = { identity: { user_id: state.user, session_id: `session-${state.user}`, email_verified: true, expires_at: '2027-01-01T00:00:00Z' }, memberships: state.member ? [{ institution_id: institution, role: state.admin ? 'admin' : 'student' }] : [] };
    } else if (path.endsWith('/sign-out')) { state.user = null; value = { success: true }; }
    else if (path.endsWith('/delete-user')) { state.user = null; value = { success: true, message: 'User deleted' }; }
    else if (path.endsWith('/sign-in/email')) { state.user = 'B'; value = { user: { id: 'B' } }; }
    else if (!state.member || !state.user) return route.fulfill({ status: 403, json: error() });
    else if (path.endsWith('/conversations')) value = { items: state.user === 'A' ? [{ id: institution, institution_id: institution, created_at: time }] : [], next_cursor: null };
    else if (path.endsWith('/answers')) value = method === 'POST' ? answer() : { items: state.user === 'A' ? [answer()] : [], next_cursor: null };
    else if (path.endsWith('/sources')) value = { items: state.user === 'A' ? [source] : [], next_cursor: null };
    else if (path.endsWith('/versions')) value = { items: [version], next_cursor: null };
    else if (path.endsWith('/chunks')) value = { items: state.emptyChunks ? [] : [{ id: institution, institution_id: institution, source_id: sourceId, version_id: versionId, ordinal: url.searchParams.has('cursor') ? 1 : 0, language: 'vi', locator: evidence.locator, text: url.searchParams.has('cursor') ? 'SECOND EXTRACTED PAGE' : 'FIRST EXTRACTED PAGE <script>bad()</script>' }], next_cursor: !state.emptyChunks && !url.searchParams.has('cursor') ? 'passage-next' : null };
    else if (path.endsWith('/context')) {
      if (state.contextFails) return route.fulfill({ status: 404, json: error('not_found') });
      value = { feedback, question: 'PRIVATE REPORTED QUESTION <script>bad()</script>', answer: answer('REPORTED CLAIM') };
    } else if (path.endsWith('/feedback')) value = { items: [feedback], next_cursor: null };
    else if (path.endsWith(`/feedback/${institution}`)) { state.mutations.push(method); value = { ...feedback, status: route.request().postDataJSON().status }; }
    else if (path.endsWith('/graph')) value = { items: [], next_cursor: null };
    else if (path.endsWith('/budget')) value = { month: '2026-09', cap_micro_usd: 50000000, spent_micro_usd: 0, reserved_micro_usd: 0, currency: 'USD' };
    if (value) return route.fulfill({ json: value });
    return route.fulfill({ status: 404, json: error('not_found') });
  });
  return state;
}
// Kobalte Select: open the labelled trigger, then pick the option by its visible label.
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: label }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function refreshIdentity(page: Page) {
  const me = page.waitForResponse(r => r.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await me;
}
async function ask(page: Page, question = 'PRIVATE A QUESTION') {
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
}

test('R3-01 same tab: detail only on exact route, account switch clears cached history and draft', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/'); await ask(page); await expect(page.locator('[data-claim]')).toContainText('PRIVATE A ANSWER');
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await page.getByRole('link', { name: 'Open conversation' }).click();
  await expect(page.getByRole('button', { name: /View answer/ })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('button', { name: /View answer|Delete conversation/ })).toHaveCount(0);
  state.user = 'B'; await refreshIdentity(page);
  await expect(page.getByRole('link', { name: 'Open conversation' })).toHaveCount(0);
  await page.evaluate(() => { location.hash = '/history/11111111-1111-4111-8111-111111111111'; });
  await expect(page.getByRole('button', { name: /View answer/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'noti.school home' }).click();
  await expect(page.getByLabel('Your question')).toHaveValue('');
  await expect(page.getByText('PRIVATE SOURCE A', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('PRIVATE A');
});

test('R3-01 delayed history and answer cannot repopulate after account or membership change', async ({ page }) => {
  const state = await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/conversations/*/answers*', async route => { if (state.user !== 'A') return route.fulfill({ status: 403, json: error() }); await gate; await route.fulfill({ json: { items: [answer()], next_cursor: null } }).catch(() => {}); });
  await page.goto(`/#/history/${institution}`);
  await expect(page.getByText('Loading conversation…')).toBeVisible();
  state.user = 'B'; await refreshIdentity(page); release();
  await expect(page.getByRole('button', { name: /View answer/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'noti.school home' }).click();
  let finish!: () => void;
  const answerGate = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/v1/answers', async route => { await answerGate; await route.fulfill({ json: answer('STALE DELAYED ANSWER') }).catch(() => {}); });
  await ask(page, 'B OWNED DRAFT'); await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  state.member = false; await refreshIdentity(page); finish();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0);
  await expect(page.getByText('STALE DELAYED ANSWER')).toHaveCount(0);
  await expect(page.getByLabel('Your question')).toHaveValue('');
});

for (const action of ['sign-out', 'delete-user']) test(`R2-04 ${action} clears owned text immediately and after reload`, async ({ page }) => {
  await fixture(page); await page.goto('/'); await page.getByLabel('Your question').fill('PRIVATE LOGOUT TEXT');
  await page.evaluate(action => { location.hash = action === 'delete-user' ? '/auth?delete_token=synthetic' : '/auth'; }, action);
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: action === 'sign-out' ? 'Sign out' : 'Confirm account deletion', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
  await expect(page.getByText('Sign in to the account before confirming deletion.', { exact: false })).toHaveCount(0);
  await page.getByRole('link', { name: 'noti.school home' }).click(); await expect(page.getByLabel('Your question')).toHaveValue('');
  await page.reload(); await expect(page.getByLabel('Your question')).toHaveValue('');
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain('PRIVATE LOGOUT TEXT');
});

test('R2-04 intentional anonymous first-login draft survives, subsequent account change clears it', async ({ page }) => {
  const state = await fixture(page, false, null); await page.goto('/');
  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
  await page.getByLabel('Your question').fill('ANONYMOUS FIRST DRAFT');
  await page.getByRole('link', { name: 'Sign in', exact: true }).first().click();
  // The account form remounts when the access scope settles; fill it only after identity requests finish.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await page.getByRole('link', { name: 'noti.school home' }).click(); await expect(page.getByLabel('Your question')).toHaveValue('ANONYMOUS FIRST DRAFT');
  state.user = 'C'; await refreshIdentity(page); await expect(page.getByLabel('Your question')).toHaveValue('');
});

test('R3-03 real 46.5 second response succeeds within frozen 155 second allowance', async ({ page }) => {
  test.setTimeout(65000);
  await fixture(page);
  await page.route('**/api/v1/answers', async route => { await new Promise(resolve => setTimeout(resolve, 46500)); await route.fulfill({ json: answer('SLOW SUCCESS') }); });
  await page.goto('/'); await ask(page);
  await expect(page.locator('[data-claim]')).toContainText('SLOW SUCCESS', { timeout: 55000 });
});

test('R3-03 stop, disconnect, conflict and reload reuse key; changed question and owner create new identities', async ({ page }) => {
  const state = await fixture(page); const keys: string[] = []; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/answers', async route => {
    keys.push(route.request().headers()['idempotency-key']!);
    if (keys.length === 1) { await gate; await route.fulfill({ json: answer('OBSOLETE RESULT') }).catch(() => {}); }
    else if (keys.length === 2) await route.abort('connectionreset');
    else await route.fulfill({ status: 409, json: error('conflict') });
  });
  await page.goto('/'); await ask(page, 'Exact pending question ');
  await expect.poll(() => keys.length).toBe(1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Processing may continue');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Processing may continue');
  release(); await expect(page.getByText('OBSOLETE RESULT')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already being processed');
  await page.reload(); await expect(page.getByLabel('Your question')).toHaveValue('Exact pending question ');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect.poll(() => keys.length).toBe(4);
  expect(new Set(keys).size).toBe(1);
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeVisible();
  await ask(page, 'Exact pending question'); await expect.poll(() => keys.length).toBe(5);
  expect(keys[4]).not.toBe(keys[0]);
  state.user = 'B'; await refreshIdentity(page); await expect(page.getByLabel('Your question')).toHaveValue('');
  await ask(page, 'Exact pending question '); await expect.poll(() => keys.length).toBe(6);
  expect(keys[5]).not.toBe(keys[0]);
});

test('R3-05 Unicode scalar limits, meaningful control rejection, truthful system reduced motion', async ({ page }) => {
  await fixture(page); let calls = 0;
  await page.route('**/api/v1/answers', async route => { calls++; await route.fulfill({ json: answer('UNICODE ACCEPTED') }); });
  await page.goto('/');
  const motion = page.getByRole('contentinfo').getByRole('button', { name: 'System reduced motion' });
  await expect(motion).toBeDisabled(); await expect(page.locator('html')).toHaveAttribute('data-motion', 'off');
  await ask(page, 'a'.repeat(4001)); await expect(page.getByRole('alert')).toContainText('Unicode'); expect(calls).toBe(0);
  await ask(page, 'bad\u0001control'); await expect(page.getByRole('alert')).toContainText('control characters'); expect(calls).toBe(0);
  await ask(page, '😀'.repeat(4000)); await expect(page.getByText('UNICODE ACCEPTED')).toBeVisible(); expect(calls).toBe(1);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) test(`R3-04 R1-04 admin passage/context review at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport); const state = await fixture(page, true);
  const requests: string[] = []; page.on('request', req => { if (req.url().includes('/api/')) requests.push(req.url()); });
  await page.goto('/#/admin');
  await choose(page, 'Select source', source.title);
  await page.getByRole('button', { name: 'Review passages' }).click();
  await expect(page.getByText('FIRST EXTRACTED PAGE <script>bad()</script>', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Evidence chunk ID', { exact: true }).first()).toHaveValue(institution);
  await expect(page.getByRole('link', { name: 'Open original file' })).toHaveAttribute('href', `/api/v1/institutions/${institution}/versions/${versionId}/file`);
  await page.getByLabel('Passage pages').getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('SECOND EXTRACTED PAGE')).toBeVisible();
  await expect(page.getByText('FIRST EXTRACTED PAGE', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark resolved' })).toBeDisabled();
  await page.getByRole('button', { name: 'Review report context' }).click();
  await expect(page.getByText('PRIVATE REPORTED QUESTION <script>bad()</script>', { exact: true })).toBeVisible();
  await expect(page.getByText('REPORTED CLAIM', { exact: true })).toBeVisible();
  await expect(page.getByText(evidence.quote, { exact: true })).toBeVisible();
  expect(await page.locator('[data-reader] script, [data-reader] img').count()).toBe(0);
  await expect(page.getByRole('button', { name: 'Mark resolved' })).toBeEnabled();
  expect(state.mutations).toEqual([]);
  expect(requests.some(url => url.includes('/conversations/') || url.endsWith('/api/v1/answers'))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: new URL(`./artifacts/repair-admin-${viewport.width}.png`, import.meta.url).pathname, fullPage: true });
  await page.getByRole('button', { name: 'Mark reviewed' }).click(); await expect.poll(() => state.mutations.length).toBe(1);
  state.admin = false; await refreshIdentity(page);
  await expect(page.getByText('PRIVATE REPORTED QUESTION', { exact: false })).toHaveCount(0);
  await expect(page.getByText('SECOND EXTRACTED PAGE')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark resolved' })).toHaveCount(0);
});

test('R3-04 R1-04 empty extraction and missing context remain explicit and unresolved', async ({ page }) => {
  const state = await fixture(page, true); state.emptyChunks = true; state.contextFails = true;
  await page.goto('/#/admin'); await choose(page, 'Select source', source.title);
  await page.getByRole('button', { name: 'Review passages' }).click();
  await expect(page.getByText('No extracted text on this page.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Review report context' }).click();
  await expect(page.getByRole('alert')).toContainText('Report context unavailable');
  await expect(page.getByRole('button', { name: 'Mark resolved' })).toBeDisabled();
  expect(state.mutations).toEqual([]);
});

test('independent regression: stopped follow-up reload preserves conversation, language, exact payload and key', async ({ page }) => {
  await fixture(page);
  const attempts: { key: string; body: unknown }[] = [];
  await page.route('**/api/v1/answers', async route => {
    attempts.push({ key: route.request().headers()['idempotency-key']!, body: route.request().postDataJSON() });
    if (attempts.length === 1) return route.fulfill({ json: answer('FIRST ANSWER') });
    return route.fulfill({ status: 409, json: error('conflict') });
  });
  await page.goto('/'); await ask(page, 'First question'); await expect(page.locator('[data-claim]')).toContainText('FIRST ANSWER');
  await page.getByRole('group', { name: 'Answer language' }).getByRole('button', { name: 'Tiếng Việt' }).click();
  await ask(page, 'Câu hỏi tiếp theo\n'); await expect(page.getByRole('alert')).toContainText('already being processed');
  expect(attempts[1]!.body).toMatchObject({ conversation_id: institution, language: 'vi', question: 'Câu hỏi tiếp theo\n' });
  await page.reload(); await expect(page.getByLabel('Your question')).toHaveValue('Câu hỏi tiếp theo\n');
  await page.getByRole('button', { name: 'Ask', exact: true }).click(); await expect.poll(() => attempts.length).toBe(3);
  expect(attempts[2]).toEqual(attempts[1]);
});

test('independent regression: obsolete callback cannot overwrite or stop a newer operation', async ({ page }) => {
  await fixture(page);
  // Deliberately simulate a transport that delivers a body even after the client aborts.
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => original(input, String(input) === '/api/v1/answers' ? { ...init, signal: undefined } : init);
  });
  let first!: () => void, second!: () => void;
  const oldGate = new Promise<void>(resolve => { first = resolve; }), newGate = new Promise<void>(resolve => { second = resolve; });
  let count = 0;
  await page.route('**/api/v1/answers', async route => {
    const index = ++count; await (index === 1 ? oldGate : newGate);
    await route.fulfill({ json: answer(index === 1 ? 'OBSOLETE' : 'CURRENT OPERATION') });
  });
  await page.goto('/'); await ask(page, 'Old operation'); await expect.poll(() => count).toBe(1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await ask(page, 'New operation'); await expect.poll(() => count).toBe(2);
  first(); await page.waitForTimeout(100);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await expect(page.locator('[data-claim]')).toHaveCount(0);
  second(); await expect(page.locator('[data-claim]')).toContainText('CURRENT OPERATION');
  await expect(page.getByText('OBSOLETE', { exact: false })).toHaveCount(0);
});

test('independent regression: delayed admin context and form drafts are discarded on role loss', async ({ page }) => {
  const state = await fixture(page, true);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/feedback/*/context', async route => { await gate; await route.fulfill({ json: { feedback, question: 'DELAYED PRIVATE REPORT', answer: answer() } }).catch(() => {}); });
  await page.goto('/#/admin'); await page.getByLabel('Document title').fill('PRIVATE ADMIN DRAFT');
  await page.getByRole('button', { name: 'Review report context' }).click();
  await expect(page.getByText('Loading report context…')).toBeVisible();
  state.admin = false; await refreshIdentity(page); release();
  await expect(page.getByRole('button', { name: 'Create source', exact: true })).toHaveCount(0);
  await expect(page.getByText('DELAYED PRIVATE REPORT')).toHaveCount(0);
  state.admin = true; await refreshIdentity(page);
  await expect(page.getByLabel('Document title')).toHaveValue('');
  await expect(page.getByText('DELAYED PRIVATE REPORT')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mark resolved' })).toBeDisabled();
});
