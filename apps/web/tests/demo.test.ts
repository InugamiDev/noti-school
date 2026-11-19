import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { ApiError, Schemas, validateAnswer } from '@noti/contracts';

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
/** Starts a demo server as it ships (password-only); `passkeys` is its DEMO_PASSKEYS opt-in. */
async function startDemo(options: { passkeys?: boolean } = {}) {
  const port = await freePort();
  const { DEMO_PASSKEYS: _inherited, ...env } = process.env;
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/demo-server.mjs', import.meta.url)), String(port)], {
    env: { ...env, DEMO_ANSWER_DELAY_MS: '0', ...(options.passkeys ? { DEMO_PASSKEYS: 'true' } : {}) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Demo server exited early with ${code}`)));
    child.stdout!.once('data', () => resolve());
  });
  return { origin: `http://127.0.0.1:${port}`, child };
}
before(async () => {
  const demo = await startDemo();
  base = demo.origin;
  server = demo.child;
});
after(() => { server?.kill(); });

const callAt = (origin: string) => async (method: string, path: string, body?: unknown) => {
  const response = await fetch(origin + path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
  return { status: response.status, json: response.status === 204 ? null : await response.json() };
};
const call = (method: string, path: string, body?: unknown) => callAt(base)(method, path, body);
const signUpAt = (origin: string) => (invitation: string | undefined, email: string, password: string) => fetch(`${origin}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(invitation ? { 'x-noti-invitation': invitation } : {}) },
  body: JSON.stringify({ email, password, name: 'Synthetic' }),
});
// Every route of the passkey plugin the web app or a visitor could call.
const passkeyRoutes = [
  ['GET', 'generate-authenticate-options'], ['POST', 'verify-authentication'], ['GET', 'generate-register-options'],
  ['POST', 'verify-registration'], ['GET', 'list-user-passkeys'], ['POST', 'delete-passkey'],
] as const;
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

// Runs last: it signs the shared demo user out and back in.
test('demo identity is password-only by default, invite-only, and sends no mail', async () => {
  const capabilities = Schemas.Capabilities.parse((await call('GET', '/api/v1/capabilities')).json);
  assert.deepEqual(
    [capabilities.identity.state, capabilities.password.state, capabilities.passkey.state, capabilities.email.state, capabilities.google.state],
    ['available', 'available', 'disabled', 'disabled', 'disabled'],
  );
  assert.equal(capabilities.passkey.reason, 'not_configured');
  // Signed in or out, no passkey route exists.
  const noPasskeyRoutes = async () => {
    for (const [method, action] of passkeyRoutes) {
      const response = await call(method, `/api/auth/passkey/${action}`, method === 'POST' ? { response: {} } : undefined);
      assert.equal(response.status, 404, action);
      assert.equal(ApiError.parse(response.json).error.code, 'not_found', action);
    }
  };
  await noPasskeyRoutes();
  const signUp = signUpAt(base);
  const first = (await school()).id;
  const seededConversation = Schemas.ConversationPage.parse((await call('GET', `/api/v1/institutions/${first}/conversations`)).json).items.at(-1)!.id;
  assert.equal((await call('POST', '/api/auth/sign-out', {})).status, 200);
  assert.equal((await call('GET', '/api/v1/me')).status, 401);
  await noPasskeyRoutes();
  assert.equal((await call('GET', '/api/v1/me')).status, 401);

  // No invitation, no account. A wrong token is refused the same way.
  for (const invitation of [undefined, 'not-an-invitation']) {
    const refused = await signUp(invitation, 'synthetic.member@example.edu', 'synthetic-passphrase-1');
    assert.equal(refused.status, 403);
    assert.equal(ApiError.parse(await refused.json()).error.code, 'forbidden');
  }
  assert.equal((await signUp('demo-invite', 'synthetic.member@example.edu', 'too-short')).status, 400);
  assert.equal((await call('GET', '/api/v1/me')).status, 401);
  const created = await signUp('demo-invite', 'synthetic.member@example.edu', 'synthetic-passphrase-1');
  assert.equal(created.status, 200);
  assert.equal(typeof (await created.json()).token, 'string');
  // Signed in at once, with no membership until the invitation is redeemed.
  const fresh = Schemas.Me.parse((await call('GET', '/api/v1/me')).json);
  assert.equal(fresh.identity.email_verified, true);
  assert.deepEqual(fresh.memberships, []);
  assert.equal((await call('POST', '/api/auth/invitations/redeem', { token: 'not-an-invitation' })).status, 403);
  Schemas.Membership.parse((await call('POST', '/api/auth/invitations/redeem', { token: 'demo-invite' })).json);
  assert.deepEqual(Schemas.Me.parse((await call('GET', '/api/v1/me')).json).memberships.map((m) => m.role), ['student']);
  // The new member joined the demo school but starts with an empty history: the seeded conversation
  // belongs to the demo student and cannot be read or continued from another account.
  const joined = Schemas.Me.parse((await call('GET', '/api/v1/me')).json).memberships[0]!.institution_id;
  assert.deepEqual(Schemas.ConversationPage.parse((await call('GET', `/api/v1/institutions/${joined}/conversations`)).json).items, []);
  const followUp = validateAnswer((await call('POST', '/api/v1/answers', { institution_id: joined, question: 'How do I get an official transcript?', language: 'en', discover: false, conversation_id: seededConversation })).json);
  assert.notEqual(followUp.conversation_id, seededConversation);
  assert.deepEqual(Schemas.AnswerPage.parse((await call('GET', `/api/v1/institutions/${joined}/conversations/${seededConversation}/answers`)).json).items, []);
  assert.equal(Schemas.ConversationPage.parse((await call('GET', `/api/v1/institutions/${joined}/conversations`)).json).items.length, 1);
  assert.equal((await signUp('demo-invite', 'synthetic.member@example.edu', 'synthetic-passphrase-1')).status, 422);

  // Everything that needs mail says so instead of pretending.
  for (const action of ['delete-user', 'request-password-reset', 'send-verification-email']) {
    const response = await call('POST', `/api/auth/${action}`, {});
    assert.equal(response.status, 503, action);
    assert.equal(ApiError.parse(response.json).error.capability, 'email', action);
  }
  // The account keeps its own password; the demo student is back for whoever runs next.
  assert.equal((await call('POST', '/api/auth/sign-out', {})).status, 200);
  assert.equal((await call('POST', '/api/auth/sign-in/email', { email: 'synthetic.member@example.edu', password: 'not-the-right-password' })).status, 401);
  assert.equal((await call('GET', '/api/v1/me')).status, 401);
  assert.equal((await call('POST', '/api/auth/sign-in/email', { email: 'synthetic.member@example.edu', password: 'synthetic-passphrase-1' })).status, 200);
  assert.equal(Schemas.Me.parse((await call('GET', '/api/v1/me')).json).identity.user_id, 'demo-account-1');
  assert.equal((await call('POST', '/api/auth/sign-in/email', { email: 'presenter@example.edu', password: 'anything-at-all' })).status, 200);
  assert.equal(Schemas.Me.parse((await call('GET', '/api/v1/me')).json).identity.user_id, 'demo-student');
});

// Its own server: the opt-in is read once, when the demo starts.
test('with DEMO_PASSKEYS=true the demo offers passkeys and keeps them behind a session', async () => {
  const demo = await startDemo({ passkeys: true });
  try {
    const at = callAt(demo.origin);
    const capabilities = Schemas.Capabilities.parse((await at('GET', '/api/v1/capabilities')).json);
    assert.deepEqual([capabilities.password.state, capabilities.passkey.state], ['available', 'available']);
    assert.equal((await at('POST', '/api/auth/sign-out', {})).status, 200);
    // Signed out, a passkey can be asked for but nothing can be registered or listed.
    const options = await at('GET', '/api/auth/passkey/generate-authenticate-options');
    assert.equal(options.status, 200);
    assert.ok(typeof options.json.challenge === 'string' && !('allowCredentials' in options.json));
    assert.equal((await at('GET', '/api/auth/passkey/generate-register-options')).status, 401);
    assert.equal((await at('GET', '/api/auth/passkey/list-user-passkeys')).status, 401);
    assert.equal((await at('POST', '/api/auth/passkey/verify-registration', { response: {} })).status, 401);
    // An assertion for a credential nobody registered creates nothing and signs nobody in.
    assert.equal((await at('POST', '/api/auth/passkey/verify-authentication', { response: { id: 'unknown' } })).status, 401);
    assert.equal((await at('GET', '/api/v1/me')).status, 401);
    // A passkey never stands in for the invitation: the account is still created by invited sign-up.
    assert.equal((await signUpAt(demo.origin)(undefined, 'synthetic.member@example.edu', 'synthetic-passphrase-1')).status, 403);
    assert.equal((await signUpAt(demo.origin)('demo-invite', 'synthetic.member@example.edu', 'synthetic-passphrase-1')).status, 200);
    assert.deepEqual((await at('GET', '/api/auth/passkey/list-user-passkeys')).json, []);
    // A registration answer that does not match the issued challenge stores nothing.
    assert.equal((await at('GET', '/api/auth/passkey/generate-register-options')).status, 200);
    assert.equal((await at('POST', '/api/auth/passkey/verify-registration', { response: { id: 'forged', response: { clientDataJSON: 'e30', publicKey: 'AAAA' } } })).status, 400);
    assert.deepEqual((await at('GET', '/api/auth/passkey/list-user-passkeys')).json, []);
  } finally {
    demo.child.kill();
  }
});
