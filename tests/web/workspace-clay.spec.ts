import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { mkdir } from 'node:fs/promises';
// intent: Clay workspace states (supported, abstained, unavailable answers; source library; account forms) against
//         explicitly synthetic intercepted fixtures, with 1440x900 and 390x844 screenshots in tests/web/artifacts.
const artifacts = new URL('./artifacts/', import.meta.url).pathname;
const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const citationId = '44444444-4444-4444-8444-444444444444';
const time = '2026-09-25T00:00:00Z';
const source = { id: sourceId, institution_id: id, title: 'Sample Student Handbook · synthetic fixture', kind: 'pdf', original_url: null, visibility: 'institution', current_version_id: versionId, created_at: time };
const second = { ...source, id: '55555555-5555-4555-8555-555555555555', title: 'Quy chế đào tạo mẫu · dữ liệu thử nghiệm', kind: 'text', current_version_id: null };
const evidence = { id: citationId, institution_id: id, source_id: sourceId, version_id: versionId, chunk_id: id, title: source.title, version_label: 'Synthetic 2025 edition', locator: { page: 31, section: 'Section 4.2', start_char: 0, end_char: 40 }, quote: 'Synthetic passage: students may withdraw until the end of the tenth week.', original_url: null };
const answers = {
  answered: { id, conversation_id: id, institution_id: id, status: 'answered', language: 'en', claims: [{ text: 'Synthetic fixture: withdrawal is possible until the end of week 10.', evidence_ids: [citationId] }], evidence: [evidence], explanation: null, created_at: time },
  abstained: { id, conversation_id: id, institution_id: id, status: 'abstained', language: 'en', claims: [], evidence: [], explanation: 'Synthetic fixture: the approved sources do not cover this question.', created_at: time },
};
const unavailable = { error: { code: 'provider_unavailable', message: 'Synthetic unavailable fixture', request_id: id, retryable: false, capability: 'answers' } };
const sizes = [{ width: 1440, height: 900 }, { width: 390, height: 844 }];
type Options = { answer?: keyof typeof answers | 'unavailable'; identity?: 'available' | 'disabled'; conversations?: unknown[]; feedbackFails?: boolean };
async function fixture(page: Page, options: Options = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requests: string[] = [];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname, method = route.request().method();
    requests.push(`${method} ${path}`);
    const cap = { state: 'available', reason: 'ready' }, off = { state: 'disabled', reason: 'not_configured' };
    let body: unknown;
    if (path.endsWith('/capabilities')) body = { mode: 'mock', answers: cap, indexing: cap, discovery: cap, google: off, email: off, identity: options.identity === 'disabled' ? off : cap };
    else if (path.endsWith('/institutions')) body = { items: [{ id, slug: 'synthetic', name: 'Synthetic University', coverage: 'synthetic_demo' }], next_cursor: null };
    else if (path.endsWith('/me')) body = { identity: { user_id: 'synthetic-user', session_id: 'synthetic-session', email_verified: true, expires_at: '2027-01-01T00:00:00Z' }, memberships: [{ institution_id: id, role: 'student' }] };
    else if (path.endsWith('/answers') && method === 'POST') {
      if (options.answer === 'unavailable') return route.fulfill({ status: 503, json: unavailable });
      body = answers[options.answer ?? 'answered'];
    } else if (path.endsWith('/conversations')) body = { items: options.conversations ?? [], next_cursor: null };
    else if (path.includes('/citations/')) body = evidence;
    else if (path.includes('/chunks/')) body = { id, institution_id: id, source_id: sourceId, version_id: versionId, ordinal: 0, text: 'Synthetic full passage.', locator: evidence.locator, language: 'en' };
    else if (path.endsWith(`/versions/${versionId}`)) body = { id: versionId, institution_id: id, source_id: sourceId, label: 'Synthetic 2025 edition', sha256: 'a'.repeat(64), status: 'approved', indexing: 'ready', effective_from: null, effective_until: null, created_at: time };
    else if (path.endsWith('/sources')) body = { items: [source, second], next_cursor: null };
    else if (path.endsWith('/feedback') && method === 'POST') {
      if (options.feedbackFails) return route.fulfill({ status: 503, json: { error: { code: 'core_unavailable', message: 'Synthetic', request_id: id, retryable: true } } });
      body = { id, institution_id: id, answer_id: id, category: 'unsupported', evidence_id: null, comment: null, status: 'open', created_at: time };
    }
    if (body) return route.fulfill({ json: body, status: method === 'POST' && path.endsWith('/feedback') ? 201 : 200 });
    return route.fulfill({ status: 404, json: { error: { code: 'not_found', message: 'Synthetic', request_id: id, retryable: false } } });
  });
  return requests;
}
async function ask(page: Page) {
  await page.goto('/');
  await page.getByLabel('Your question').fill('Synthetic question');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
}
const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

for (const size of sizes) {
  test(`supported answer at ${size.width}px: school from Me, sources badge, citation highlight and copy toast`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize(size); await fixture(page); await ask(page);
    const card = page.getByRole('article', { name: 'Answer with sources' });
    await expect(card).toBeVisible();
    await expect(page.getByText('Synthetic University', { exact: true })).toBeVisible();
    await expect(page.getByText(/verified/i)).toHaveCount(0);
    await expect(page.locator('[data-claim]')).toContainText('withdrawal is possible');
    // The asked question is echoed above the answer and the composer is cleared, so Enter cannot resend it by accident.
    await expect(page.getByText('You asked: Synthetic question')).toBeVisible();
    await expect(page.getByLabel('Your question')).toHaveValue('');
    // Sources come before the follow-up composer in reading order (the phone layout).
    const order = await page.evaluate(() => {
      const sources = document.getElementById('sources-heading')!, follow = document.getElementById('follow-up-heading')!;
      return !!(sources.compareDocumentPosition(follow) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
    await page.getByRole('button', { name: 'Citation 1: open source' }).click();
    await expect(page.locator(`mark[data-passage="${citationId}"][data-active]`)).toHaveCount(1);
    await expect(page.getByRole('article', { name: 'Source citation' })).toBeFocused();
    await page.getByRole('button', { name: 'Copy citation' }).first().click();
    await expect(page.getByText('Citation copied')).toBeVisible();
    expect(await fits(page)).toBe(true);
    await page.screenshot({ path: `${artifacts}clay-answer-supported-${size.width}.png`, fullPage: true });
  });

  test(`abstained answer at ${size.width}px uses the no-answer state with next steps`, async ({ page }) => {
    await page.setViewportSize(size); await fixture(page, { answer: 'abstained' }); await ask(page);
    const card = page.getByRole('article', { name: 'Not enough evidence' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('do not cover this question');
    await expect(page.getByRole('article', { name: 'Answer with sources' })).toHaveCount(0);
    await expect(page.locator('[data-claim]')).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Browse sources' })).toBeVisible();
    await card.getByRole('button', { name: 'Rephrase' }).click();
    await expect(page.getByLabel('Your question')).toBeFocused();
    expect(await fits(page)).toBe(true);
    await page.screenshot({ path: `${artifacts}clay-answer-abstained-${size.width}.png`, fullPage: true });
  });

  test(`unavailable provider at ${size.width}px shows an alert and no answer text`, async ({ page }) => {
    await page.setViewportSize(size); await fixture(page, { answer: 'unavailable' }); await ask(page);
    await expect(page.getByRole('alert')).toContainText('Answers are temporarily unavailable');
    await expect(page.getByRole('article', { name: 'Answers unavailable' })).toBeVisible();
    await expect(page.locator('[data-claim]')).toHaveCount(0);
    await expect(page.getByLabel('Your question')).toHaveValue('Synthetic question');
    expect(await fits(page)).toBe(true);
    await page.screenshot({ path: `${artifacts}clay-answer-unavailable-${size.width}.png`, fullPage: true });
  });

  test(`source library at ${size.width}px: badges, diacritic-insensitive filter and empty filter state`, async ({ page }) => {
    await page.setViewportSize(size); await fixture(page); await page.goto('/#/sources');
    await expect(page.getByRole('heading', { name: 'Source library' })).toBeVisible();
    await expect(page.getByText('Current version', { exact: true })).toBeVisible();
    await expect(page.getByText('Awaiting a current version', { exact: true })).toBeVisible();
    expect(await fits(page)).toBe(true);
    await page.screenshot({ path: `${artifacts}clay-sources-${size.width}.png`, fullPage: true });
    const filter = page.getByRole('searchbox', { name: 'Filter sources on this page' });
    await filter.fill('quy che dao tao');
    await expect(page.getByRole('link', { name: /Quy chế đào tạo mẫu/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Sample Student Handbook/ })).toHaveCount(0);
    await filter.fill('nothing matches this');
    await expect(page.getByRole('heading', { name: 'No matching sources' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(page.getByRole('link', { name: /Sample Student Handbook/ })).toBeVisible();
  });

  test(`account forms at ${size.width}px: inline errors, no request until valid, provider notices`, async ({ page }) => {
    await page.setViewportSize(size); const requests = await fixture(page);
    await page.route('**/api/v1/me', route => route.fulfill({ status: 401, json: { error: { code: 'unauthenticated', message: 'Synthetic', request_id: id, retryable: false } } }));
    await page.goto('/#/auth');
    await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
    // Every signed-out mode is reachable at this width: the tab list wraps instead of clipping.
    for (const name of ['Sign in', 'Create account', 'Verify email', 'Reset password']) await expect(page.getByRole('tab', { name })).toBeInViewport();
    await expect(page.getByText('Google sign-in is not available yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeDisabled();
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Use 12 to 128 characters.')).toBeVisible();
    expect(requests.some(r => r.includes('/api/auth/'))).toBe(false);
    await page.getByRole('tab', { name: 'Create account' }).click();
    await expect(page.getByText('Email delivery is unavailable or unconfirmed.', { exact: false })).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
    expect(await fits(page)).toBe(true);
    await page.getByRole('tab', { name: 'Sign in' }).click();
    await page.screenshot({ path: `${artifacts}clay-auth-${size.width}.png`, fullPage: true });
  });
}

test('signed-in account page shows the account card and no sign-in form', async ({ page }) => {
  await fixture(page); await page.goto('/#/auth');
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Redeem invitation' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Sign in' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Create account' })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
});

test('identity outage is not reported as signed out', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/v1/me', route => route.fulfill({ status: 503, json: { error: { code: 'core_unavailable', message: 'Synthetic', request_id: id, retryable: true } } }));
  await page.goto('/#/answer');
  await expect(page.getByText('Your account could not be checked right now.')).toBeVisible();
  await expect(page.getByText('Not signed in.')).toHaveCount(0);
  await expect(page.locator('.site-nav-account')).toHaveText('Account');
  await page.goto('/#/history');
  await expect(page.getByRole('heading', { name: 'Your account could not be checked' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Sign in' })).toHaveCount(0);
});

test('feedback failure stays visible and does not claim success', async ({ page }) => {
  await fixture(page, { feedbackFails: true }); await ask(page);
  await page.getByRole('button', { name: 'Report an issue' }).click();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'unavailable' })).toBeVisible();
  await expect(page.getByText('Feedback received. Thank you.')).toHaveCount(0);
});

test('empty history offers the first question and returns focus to the composer', async ({ page }) => {
  await fixture(page); await page.goto('/#/history');
  await expect(page.getByRole('heading', { name: 'No conversations yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Ask your first question' }).click();
  await expect(page.getByLabel('Your question')).toBeFocused();
});

test('signed-out answer workspace names no school and auth unavailability is explicit', async ({ page }) => {
  await fixture(page, { identity: 'disabled' });
  await page.route('**/api/v1/me', route => route.fulfill({ status: 401, json: { error: { code: 'unauthenticated', message: 'Synthetic', request_id: id, retryable: false } } }));
  await page.goto('/#/answer');
  await expect(page.getByText('Not signed in.')).toBeVisible();
  await expect(page.getByText('Synthetic University', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No answer on screen' })).toBeVisible();
  await page.goto('/#/auth');
  await expect(page.getByText('Sign-in availability is not confirmed.', { exact: false })).toBeVisible();
  await expect(page.locator('form').getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
});
