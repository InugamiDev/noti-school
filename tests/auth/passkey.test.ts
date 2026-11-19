import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, signup, cookies, internalSession, origin } from './helpers.js';
import { SoftwareAuthenticator } from './webauthn.js';
import { createService, type SessionIdentity } from '../../apps/auth/src/service.js';

type Fixture = Awaited<ReturnType<typeof fixture>>;
const join = (...values: string[]) => values.filter(Boolean).join('; ');
async function signedIn(f: Fixture) {
  assert.equal((await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' })).status, 200);
  const login = await f.request('/sign-in/email', signup);
  assert.equal(login.status, 200);
  return cookies(login);
}
async function register(f: Fixture, authenticator: SoftwareAuthenticator, session: string) {
  const options = await f.request('/passkey/generate-register-options', undefined, { cookie: session });
  assert.equal(options.status, 200, await options.clone().text());
  const { challenge, rp } = await options.json() as { challenge: string; rp: { id: string; name: string } };
  assert.deepEqual(rp, { id: 'localhost', name: 'noti.school' });
  return f.request('/passkey/verify-registration', { response: authenticator.register(challenge) },
    { cookie: join(session, cookies(options)) });
}
async function authenticate(f: Fixture, authenticator: SoftwareAuthenticator, assertOrigin = origin) {
  const options = await f.request('/passkey/generate-authenticate-options');
  assert.equal(options.status, 200, await options.clone().text());
  const { challenge, rpId } = await options.json() as { challenge: string; rpId: string };
  assert.equal(rpId, 'localhost');
  return f.request('/passkey/verify-authentication', { response: authenticator.assert(challenge, assertOrigin) }, { cookie: cookies(options) });
}

test('passkey registration needs a verified session, then passkey sign-in yields a normal session', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false, passkeys: true });
  assert.equal((await f.request('/passkey/generate-register-options')).status, 401);
  assert.equal((await f.request('/passkey/verify-registration', { response: {} })).status, 401);
  assert.equal((await f.request('/passkey/list-user-passkeys')).status, 401);
  const session = await signedIn(f);
  const key = new SoftwareAuthenticator('localhost', origin);
  const registered = await register(f, key, session);
  assert.equal(registered.status, 200, await registered.clone().text());
  assert.equal(f.db.passkey!.length, 1); assert.equal(f.db.passkey![0]!.userId, f.db.user![0]!.id);
  assert.equal(f.db.user!.length, 1, 'A passkey never creates a user');
  const listed = await f.request('/passkey/list-user-passkeys', undefined, { cookie: session });
  assert.equal(listed.status, 200); assert.equal((await listed.json()).length, 1);
  const sessions = f.db.session!.length;
  const login = await authenticate(f, key);
  assert.equal(login.status, 200, await login.clone().text());
  assert.equal(f.db.session!.length, sessions + 1);
  const passkeySession = cookies(login);
  assert.match(passkeySession, /session_token/);
  const introspected = await internalSession(f.service, passkeySession);
  assert.equal(introspected.status, 200);
  assert.equal((await introspected.json()).user_id, f.db.user![0]!.id);
  assert.equal(f.calls.filter(c => c.path.endsWith('/redeem')).length, 0, 'Passkey sign-in grants no membership');
  // A challenge is single use and an assertion for another origin is rejected by WebAuthn verification.
  assert.notEqual((await authenticate(f, key, 'https://evil.invalid')).status, 200);
  const unknown = new SoftwareAuthenticator('localhost', origin);
  assert.equal((await authenticate(f, unknown)).status, 401);
});

test('passkey routes reject cross-origin requests, session-minting registration and unexposed routes', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false, passkeys: true });
  const session = await signedIn(f);
  for (const headers of [{ origin: 'https://evil.invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await f.request('/passkey/verify-authentication', { response: { id: 'x' } }, headers)).status, 403);
    assert.equal((await f.request('/passkey/generate-authenticate-options', undefined, headers)).status, 403);
    assert.equal((await f.request('/passkey/generate-register-options', undefined, { cookie: session, ...headers })).status, 403);
    assert.equal((await f.request('/passkey/delete-passkey', { id: 'x' }, { cookie: session, ...headers })).status, 403);
  }
  assert.equal((await f.request('/passkey/generate-authenticate-options', undefined, { 'sec-fetch-site': 'same-site' })).status, 403);
  assert.equal((await f.request('/passkey/verify-authentication', { response: { id: 'x' } })).status, 400, 'No challenge cookie');
  const options = await f.request('/passkey/generate-register-options', undefined, { cookie: session });
  const { challenge } = await options.json() as { challenge: string };
  const key = new SoftwareAuthenticator('localhost', origin);
  const minting = await f.request('/passkey/verify-registration', { response: key.register(challenge), createSession: true },
    { cookie: join(session, cookies(options)) });
  assert.equal(minting.status, 403); assert.equal(f.db.passkey!.length, 0);
  assert.equal((await f.request('/passkey/update-passkey', { id: 'x', name: 'y' }, { cookie: session })).status, 404);
  assert.equal((await f.request('/passkey/generate-register-options', { name: 'x' }, { cookie: session })).status, 400, 'Wrong method');
  // Bodies stay bounded on passkey routes too.
  assert.equal((await f.request('/passkey/verify-authentication', { response: { id: 'x'.repeat(17000) } })).status, 413);
});

test('users list and delete only their own passkeys', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false, passkeys: true });
  const owner = await signedIn(f);
  assert.equal((await register(f, new SoftwareAuthenticator('localhost', origin), owner)).status, 200);
  const passkeyId = String(f.db.passkey![0]!.id);
  // A second verified account written straight to the store: the invitation mock serves one email, and the
  // internal adapter's create hook would (correctly) refuse a user without an invitation.
  const now = new Date();
  const other = await f.context.adapter.create<{ id: string }>({ model: 'user',
    data: { email: 'other@example.invalid', name: 'Synthetic other', emailVerified: true, createdAt: now, updatedAt: now } });
  await f.context.internalAdapter.linkAccount({ userId: other.id, providerId: 'credential', accountId: other.id,
    password: await f.context.password.hash(signup.password) });
  const otherLogin = await f.request('/sign-in/email', { email: 'other@example.invalid', password: signup.password });
  assert.equal(otherLogin.status, 200);
  const otherSession = cookies(otherLogin);
  const otherList = await f.request('/passkey/list-user-passkeys', undefined, { cookie: otherSession });
  assert.deepEqual(await otherList.json(), []);
  const stolen = await f.request('/passkey/delete-passkey', { id: passkeyId }, { cookie: otherSession });
  assert.notEqual(stolen.status, 200); assert.equal(f.db.passkey!.length, 1);
  assert.equal((await f.request('/passkey/delete-passkey', { id: passkeyId })).status, 401);
  const deleted = await f.request('/passkey/delete-passkey', { id: passkeyId }, { cookie: owner });
  assert.equal(deleted.status, 200, await deleted.clone().text()); assert.equal(f.db.passkey!.length, 0);
});

test('unverified sessions cannot manage passkeys and passkey sign-in to an unverified user is refused', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false, passkeys: true });
  const unverified: SessionIdentity = { user: { id: 'u', email: 'u@example.invalid', emailVerified: false },
    session: { id: 's', userId: 'u', expiresAt: new Date(Date.now() + 60_000) } };
  const service = createService({ config: f.cfg, auth: f.auth, mail: f.mail, invitations: f.invitations,
    ready: async () => true, readSession: async () => unverified });
  for (const [path, method] of [['generate-register-options', 'GET'], ['list-user-passkeys', 'GET'], ['verify-registration', 'POST'], ['delete-passkey', 'POST']] as const) {
    const response = await service(new Request(`${origin}/api/auth/passkey/${path}`, { method,
      headers: { origin, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{"id":"x","response":{}}' } : {}) }));
    assert.equal(response.status, 401, path);
  }
  const session = await signedIn(f);
  const key = new SoftwareAuthenticator('localhost', origin);
  assert.equal((await register(f, key, session)).status, 200);
  f.db.user![0]!.emailVerified = false;
  const sessions = f.db.session!.length;
  assert.equal((await authenticate(f, key)).status, 403);
  assert.equal(f.db.session!.length, sessions);
});

test('passkey sign-in has sign-in style per-client limits', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false, passkeys: true });
  const client = cookies(await f.request('/get-session'));
  const attempt = () => f.request('/passkey/verify-authentication', { response: { id: 'synthetic-credential' } }, { cookie: client });
  for (let i = 0; i < 10; i++) assert.equal((await attempt()).status, 400);
  assert.equal((await attempt()).status, 429);
});

test('a credential id registers once, names are bounded and a refused authenticator is a client error', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false, passkeys: true });
  const session = await signedIn(f);
  const key = new SoftwareAuthenticator('localhost', origin);
  assert.equal((await register(f, key, session)).status, 200);
  // Review finding 1: the same credential id again (here by the same user) must not create a second row.
  assert.equal((await register(f, key, session)).status, 400);
  assert.equal(f.db.passkey!.length, 1);
  // Review finding 5: names beyond the UI's 64 characters are refused before the plugin runs.
  const options = await f.request('/passkey/generate-register-options', undefined, { cookie: session });
  const { challenge } = await options.json() as { challenge: string };
  const other = new SoftwareAuthenticator('localhost', origin);
  assert.equal((await f.request('/passkey/verify-registration', { response: other.register(challenge), name: 'x'.repeat(65) },
    { cookie: join(session, cookies(options)) })).status, 400);
  // Review finding 4: a foreign clientData origin is reported as 400, not as a 500 outage.
  const again = await f.request('/passkey/generate-register-options', undefined, { cookie: session });
  const fresh = await again.json() as { challenge: string };
  assert.equal((await f.request('/passkey/verify-registration', { response: other.register(fresh.challenge, 'https://evil.invalid') },
    { cookie: join(session, cookies(again)) })).status, 400);
  assert.equal(f.db.passkey!.length, 1);
});
