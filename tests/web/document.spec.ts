import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';

// The original document opens inside the app; the API file URL is only ever fetched for a download.
const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const citationId = '44444444-4444-4444-8444-444444444444';
const chunkId = '55555555-5555-4555-8555-555555555555';
const otherChunk = '66666666-6666-4666-8666-666666666666';
const time = '2026-09-25T00:00:00Z';
const source = { id: sourceId, institution_id: id, title: 'Synthetic Handbook 2026', kind: 'pdf', original_url: null, visibility: 'institution', current_version_id: versionId, created_at: time };
const version = { id: versionId, institution_id: id, source_id: sourceId, label: '2026 edition', sha256: 'a'.repeat(64), status: 'approved', indexing: 'ready', effective_from: '2026-08-01T00:00:00Z', effective_until: null, created_at: time };
const chunk = (chunk_id: string, ordinal: number, page: number, section: string, text: string) => ({ id: chunk_id, institution_id: id, source_id: sourceId, version_id: versionId, ordinal, text, locator: { page, section, start_char: 0, end_char: text.length }, language: 'en' });
const chunks = [chunk(otherChunk, 0, 1, '1. Scope', 'Synthetic first page text.'), chunk(chunkId, 1, 2, '2. Rules', 'Synthetic cited passage text.')];
const evidence = { id: citationId, institution_id: id, source_id: sourceId, version_id: versionId, chunk_id: chunkId, title: source.title, version_label: version.label, locator: { page: 2, section: '2. Rules', start_char: 0, end_char: 29 }, quote: 'Synthetic cited passage text.', original_url: null };
const answer = { id, conversation_id: id, institution_id: id, status: 'answered', language: 'en', claims: [{ text: 'Synthetic claim for the document test.', evidence_ids: [citationId] }], evidence: [evidence], explanation: null, created_at: time };
const fileHeaders = { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment', 'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff' };
const denied = (code: string, status: number) => ({ status, json: { error: { code, message: 'Synthetic', request_id: id, retryable: false } } });

async function setup(page: Page, options: { admin?: boolean; versionMissing?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.endsWith('/capabilities')) { const cap = { state: 'available', reason: 'ready' }; return route.fulfill({ json: { mode: 'mock', answers: cap, indexing: cap, discovery: cap, google: cap, email: cap, identity: cap } }); }
    if (path.endsWith('/institutions')) return route.fulfill({ json: { items: [{ id, slug: 'demo', name: 'Demo university', coverage: 'synthetic_demo' }], next_cursor: null } });
    if (path.endsWith('/me')) return route.fulfill({ json: { identity: { user_id: 'synthetic-user', session_id: 's', email_verified: true, expires_at: '2027-01-01T00:00:00Z' }, memberships: [{ institution_id: id, role: options.admin === false ? 'student' : 'admin' }] } });
    if (path.endsWith('/answers') && method === 'POST') return route.fulfill({ json: answer });
    if (path.endsWith(`/sources/${sourceId}`)) return route.fulfill({ json: source });
    if (path.endsWith(`/sources/${sourceId}/versions`)) return route.fulfill({ json: { items: [version], next_cursor: null } });
    if (path.endsWith(`/versions/${versionId}/file`)) return route.fulfill({ status: 200, headers: fileHeaders, body: Buffer.from('%PDF-1.4 synthetic bytes') });
    if (path.endsWith(`/versions/${versionId}/chunks`)) return options.admin === false ? route.fulfill(denied('forbidden', 403)) : route.fulfill({ json: { items: chunks, next_cursor: null } });
    if (path.endsWith(`/versions/${versionId}`)) return options.versionMissing ? route.fulfill(denied('not_found', 404)) : route.fulfill({ json: version });
    if (path.endsWith(`/chunks/${chunkId}`)) return route.fulfill({ json: chunks[1] });
    if (path.endsWith(`/citations/${citationId}`)) return route.fulfill({ json: evidence });
    return route.fulfill(denied('core_unavailable', 503));
  });
}
const watchNavigation = (page: Page) => {
  const urls: string[] = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) urls.push(frame.url()); });
  page.on('popup', (popup) => urls.push(`popup:${popup.url()}`));
  return urls;
};

test('a citation opens the document at the cited passage and downloads without exposing the API URL', async ({ page }) => {
  await setup(page);
  const urls = watchNavigation(page);
  await page.goto('/');
  await page.getByRole('textbox', { name: /^(Your question|Câu hỏi của bạn)$/ }).fill('Synthetic document question');
  await page.getByRole('button', { name: /^(Ask|Hỏi)$/ }).click();
  await page.getByRole('button', { name: 'Open source citation 1' }).click();
  await expect(page.getByRole('article', { name: 'Source citation' })).toBeVisible();
  expect(await page.locator('a[href*="/api/"]').count()).toBe(0);
  await page.getByRole('link', { name: /Open original/ }).click();
  expect(new URL(page.url()).hash).toBe(`#/sources/${sourceId}/versions/${versionId}?page=2&chunk=${chunkId}&from=answer`);
  await expect(page.getByRole('heading', { name: 'Synthetic Handbook 2026' })).toBeVisible();
  await expect(page.getByText('2026 edition', { exact: true })).toBeVisible();
  await expect(page.getByText('Current', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page 2' })).toBeVisible();
  const cited = page.locator('.document-passage.is-cited');
  await expect(cited).toContainText('Synthetic cited passage text.');
  await expect(cited).toBeInViewport();
  await expect(cited).toBeFocused();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download file/ }).click();
  expect((await download).suggestedFilename()).toBe('Synthetic-Handbook-2026-2026-edition.pdf');
  await page.getByRole('button', { name: 'Back to answer' }).click();
  await expect(page.locator('.claim')).toContainText('Synthetic claim for the document test.');
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
  expect(await page.locator('a[href*="/api/"]').count()).toBe(0);
});

test('members see the cited passage and the download when the passage list is admin-only', async ({ page }) => {
  await setup(page, { admin: false });
  const urls = watchNavigation(page);
  await page.goto(`/#/sources/${sourceId}/versions/${versionId}?page=2&chunk=${chunkId}`);
  await expect(page.getByRole('heading', { name: 'Synthetic Handbook 2026' })).toBeVisible();
  await expect(page.locator('.document-cited')).toContainText('Synthetic cited passage text.');
  await expect(page.getByText('Your account can read the passages an answer cites', { exact: false })).toBeVisible();
  await expect(page.locator('.document-page')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Download file/ })).toBeEnabled();
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
});

test('a removed edition explains itself instead of failing silently', async ({ page }) => {
  await setup(page, { versionMissing: true });
  await page.goto(`/#/sources/${sourceId}/versions/${versionId}`);
  await expect(page.getByRole('alert')).toContainText('not available');
  await expect(page.getByRole('alert').getByRole('link', { name: 'Browse sources' })).toBeVisible();
});

test('source editions open in the app reader and download under a readable name', async ({ page }) => {
  await setup(page);
  const urls = watchNavigation(page);
  await page.goto(`/#/sources/${sourceId}`);
  const open = page.getByRole('link', { name: 'Open original version' });
  await expect(open).toHaveAttribute('href', `#/sources/${sourceId}/versions/${versionId}`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download file/ }).click();
  expect((await download).suggestedFilename()).toBe('Synthetic-Handbook-2026-2026-edition.pdf');
  await open.click();
  await expect(page.getByRole('heading', { name: 'Synthetic Handbook 2026' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Page 1' })).toBeVisible();
  expect(urls.filter((u) => u.includes('/api/'))).toEqual([]);
});
