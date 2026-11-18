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
const ask = async (institution_id: string, question: string, discover: boolean, language: 'en' | 'vi' = 'en') =>
  validateAnswer((await call('POST', '/api/v1/answers', { institution_id, question, language, discover })).json);

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

test('the second demo school answers with an abstention, never a refusal', async () => {
  const second = Schemas.InstitutionPage.parse((await call('GET', '/api/v1/institutions')).json).items[1]!;
  const me = Schemas.Me.parse((await call('GET', '/api/v1/me')).json);
  assert.ok(me.memberships.some((m) => m.institution_id === second.id && m.role === 'student'));
  const response = await call('POST', '/api/v1/answers', { institution_id: second.id, question: 'When is the exam timetable published?', language: 'en', discover: true });
  assert.equal(response.status, 200);
  const answer = validateAnswer(response.json);
  assert.equal(answer.status, 'abstained');
  assert.equal(answer.institution_id, second.id);
  assert.ok(answer.explanation);
  // A student there still cannot read or change what administrators manage.
  assert.equal((await call('GET', `/api/v1/institutions/${second.id}/web-documents`)).status, 403);
  assert.equal((await call('PUT', `/api/v1/institutions/${second.id}/domains`, { domains: ['example.edu'] })).status, 403);
});

test('an approved passage is scored by how well it matches, and an unrelated one is never cited', async () => {
  const { id } = await school();
  // "miễn phí" (free) shares one syllable with "học phí" (tuition). That is not a match.
  const withoutWeb = await ask(id, 'Gửi xe máy có miễn phí không', false, 'vi');
  assert.equal(withoutWeb.status, 'abstained');
  assert.deepEqual(withoutWeb.evidence, []);
  const withWeb = await ask(id, 'Gửi xe máy có miễn phí không', true, 'vi');
  assert.deepEqual(withWeb.evidence.map((e) => [e.origin, e.domain]), [['web', 'news.example.org']]);
  assert.ok(withWeb.evidence.every((e) => !/Scholarships/.test(e.title)));
  // Sharing only ordinary words with a passage does not make it on topic either.
  assert.equal((await ask(id, 'Where can students collect a parcel in person?', false)).status, 'abstained');
  // A close match reads High; a single shared topic reads Medium and the answer says so.
  const strong = await ask(id, 'How do I get an official transcript?', false);
  assert.equal(strong.status, 'answered');
  assert.ok(strong.evidence[0]!.confidence!.relevance >= 0.8 && strong.confidence! >= 0.8);
  const partial = await ask(id, 'Is there a fee?', false);
  assert.equal(partial.status, 'qualified');
  assert.match(partial.evidence[0]!.title, /Scholarships/);
  const { relevance, overall } = partial.evidence[0]!.confidence!;
  assert.ok(relevance >= 0.6 && relevance < 0.8 && overall >= 0.6 && overall < 0.8);
  for (const answer of [strong, partial]) {
    for (const e of answer.evidence) {
      assert.equal(e.origin, 'approved');
      assert.ok(e.confidence!.relevance >= 0.6, 'a cited passage is on topic');
      assert.match(e.confidence!.model, /synthetic-demo \(not a model score\)/);
    }
  }
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

test('a page saved in the personal space joins answers only after its owner chooses to use it', async () => {
  const space = Schemas.Institution.parse((await call('POST', '/api/v1/me/personal-space')).json);
  const scope = `/api/v1/institutions/${space.id}`;
  const question = 'When is the exam timetable published?';
  const pages = Schemas.WebDocumentPage.parse((await call('GET', `${scope}/web-documents`)).json).items;
  const exam = pages.find((p) => p.final_url.endsWith('/exam-timetable'))!;
  const saved = Schemas.WebDocument.parse((await call('PATCH', `${scope}/web-documents/${exam.id}`, { action: 'promote' })).json);
  assert.ok(saved.source_id);
  const versions = Schemas.VersionPage.parse((await call('GET', `${scope}/sources/${saved.source_id}/versions`)).json).items;
  assert.deepEqual(versions.map((v) => v.status), ['pending_review']);
  // Saving alone approves nothing: the space has no document in use and the page is still cited as web.
  const listed = async () => Schemas.SourcePage.parse((await call('GET', `${scope}/sources`)).json).items;
  assert.ok((await listed()).every((s) => s.current_version_id === null));
  assert.ok((await ask(space.id, question, true)).evidence.every((e) => e.origin === 'web'));
  Schemas.Job.parse((await call('POST', `${scope}/versions/${versions[0]!.id}/actions`, { action: 'approve', expected_status: 'pending_review' })).json);
  assert.ok((await listed()).some((s) => s.id === saved.source_id && s.current_version_id === versions[0]!.id));
  const answer = await ask(space.id, question, true);
  assert.deepEqual(answer.evidence.map((e) => [e.origin, e.source_id, e.domain]), [['approved', saved.source_id, null]]);
  assert.match(answer.evidence[0]!.quote, /^Synthetic demo text/);
});
