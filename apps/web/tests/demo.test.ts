import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Schemas, validateAnswer } from '@noti/contracts';

// intent: the local demo must speak the frozen contract, label its web evidence as web, and keep
// every synthetic page marked synthetic. Loopback only: the demo server makes no outbound calls.
// status: done | next: none | confidence: high
let server: ChildProcess;
let base = '';
const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('No port'))));
  });
});
before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [fileURLToPath(new URL('../scripts/demo-server.mjs', import.meta.url)), String(port)], {
    env: { ...process.env, DEMO_ANSWER_DELAY_MS: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (code) => reject(new Error(`Demo server exited early with ${code}`)));
    server.stdout!.once('data', () => resolve());
  });
});
after(() => { server?.kill(); });

const call = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(base + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  return { status: response.status, json: response.status === 204 ? null : await response.json() };
};
const school = async () => Schemas.InstitutionPage.parse((await call('GET', '/api/v1/institutions')).json).items[0]!;
const ask = async (institution_id: string, question: string, discover: boolean) =>
  validateAnswer((await call('POST', '/api/v1/answers', { institution_id, question, language: 'en', discover })).json);

test('demo institutions and seeded history follow the frozen shapes', async () => {
  const page = Schemas.InstitutionPage.parse((await call('GET', '/api/v1/institutions')).json);
  assert.deepEqual(page.items.map((i) => i.kind), ['school', 'school']);
  assert.deepEqual(page.items[0]!.domains, ['example.edu']);
  const first = page.items[0]!.id;
  const conversations = Schemas.ConversationPage.parse((await call('GET', `/api/v1/institutions/${first}/conversations`)).json);
  assert.equal(conversations.items.length, 1);
  const answers = Schemas.AnswerPage.parse((await call('GET', `/api/v1/institutions/${first}/conversations/${conversations.items[0]!.id}/answers`)).json);
  for (const answer of answers.items) {
    validateAnswer(answer);
    assert.ok(answer.evidence.every((e) => e.origin === 'approved' && e.domain === null && e.retrieved_at === null));
  }
  Schemas.GraphEdgePage.parse((await call('GET', `/api/v1/institutions/${first}/graph`)).json);
});

test('discovery adds labelled web evidence with confidence; without it the web is not searched', async () => {
  const { id } = await school();
  const medium = await ask(id, 'What are the library opening hours during exams?', true);
  const web = medium.evidence.filter((e) => e.origin === 'web');
  assert.ok(web.length > 0);
  for (const e of web) {
    assert.ok(['example.edu', 'news.example.org'].includes(e.domain ?? ''));
    assert.ok(e.retrieved_at && e.confidence);
    assert.match(e.title, /synthetic demo page/);
    assert.match(e.quote, /^Synthetic demo text/);
    assert.match(e.confidence!.model, /synthetic-demo/);
  }
  const low = await ask(id, 'Is motorbike parking free?', true);
  assert.equal(low.status, 'qualified');
  assert.ok(low.confidence !== null && low.confidence < 0.6);
  assert.equal(low.evidence[0]!.domain, 'news.example.org');
  assert.ok(low.claims.every((c) => c.confidence !== null && c.confidence < 0.6));
  const withoutWeb = await ask(id, 'Is motorbike parking free?', false);
  assert.equal(withoutWeb.status, 'abstained');
  assert.equal(withoutWeb.confidence, null);
});

test('web pages can be promoted into review, refreshed and blocked; domains are replaced', async () => {
  const { id } = await school();
  const list = async () => Schemas.WebDocumentPage.parse((await call('GET', `/api/v1/institutions/${id}/web-documents`)).json).items;
  const pages = await list();
  assert.equal(pages.length, 3);
  assert.ok(pages.every((p) => /synthetic demo page/.test(p.title) && ['example.edu', 'news.example.org'].includes(p.domain)));
  assert.deepEqual(pages.map((p) => p.state).sort(), ['fresh', 'fresh', 'stale']);
  const act = async (page: string, action: string) =>
    Schemas.WebDocument.parse((await call('PATCH', `/api/v1/institutions/${id}/web-documents/${page}`, { action })).json);
  const stale = pages.find((p) => p.state === 'stale')!;
  assert.equal((await act(stale.id, 'refresh')).state, 'fresh');
  const promoted = await act(pages[0]!.id, 'promote');
  assert.ok(promoted.source_id);
  const versions = Schemas.VersionPage.parse((await call('GET', `/api/v1/institutions/${id}/sources/${promoted.source_id}/versions`)).json);
  assert.deepEqual(versions.items.map((v) => v.status), ['pending_review']);
  const parking = pages.find((p) => p.final_url.endsWith('/parking'))!;
  await act(parking.id, 'block');
  assert.equal((await list()).length, 2);
  assert.equal((await ask(id, 'Is motorbike parking free?', true)).status, 'abstained');
  const updated = Schemas.Institution.parse((await call('PUT', `/api/v1/institutions/${id}/domains`, { domains: ['example.edu', 'library.example.edu'] })).json);
  assert.deepEqual(updated.domains, ['example.edu', 'library.example.edu']);
  assert.equal((await call('PUT', `/api/v1/institutions/${id}/domains`, { domains: [] })).status, 400);
});

test('the personal space is created once, listed for its owner and answers inside its own scope', async () => {
  const created = await call('POST', '/api/v1/me/personal-space');
  assert.equal(created.status, 201);
  const space = Schemas.Institution.parse(created.json);
  assert.equal(space.kind, 'personal');
  assert.equal(Schemas.Institution.parse((await call('POST', '/api/v1/me/personal-space')).json).id, space.id);
  const me = Schemas.Me.parse((await call('GET', '/api/v1/me')).json);
  assert.ok(me.memberships.some((m) => m.institution_id === space.id));
  const listed = Schemas.InstitutionPage.parse((await call('GET', '/api/v1/institutions')).json);
  assert.equal(listed.items.filter((i) => i.kind === 'personal').length, 1);
  const answer = await ask(space.id, 'When is the exam timetable published?', true);
  assert.equal(answer.institution_id, space.id);
  assert.ok(answer.evidence.length > 0 && answer.evidence.every((e) => e.origin === 'web' && e.institution_id === space.id));
  const conversations = Schemas.ConversationPage.parse((await call('GET', `/api/v1/institutions/${space.id}/conversations`)).json);
  assert.deepEqual(conversations.items.map((c) => c.institution_id), [space.id]);
});
