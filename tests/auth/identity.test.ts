import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, signup, cookies, origin, secret } from './helpers.js';
import { Session } from '../../packages/contracts/src/index.js';

test('password signup checks invitation twice without consumption, verifies once, and revokes sessions', async () => {
  const f = await fixture();
  assert.equal((await f.request('/sign-up/email', signup)).status, 403);
  assert.equal((await f.request('/sign-up/email', { ...signup, role: 'admin' }, { 'x-noti-invitation': 'invite-one' })).status, 403);
  assert.equal((await f.request('/sign-up/email', { ...signup, email: 'wrong@example.invalid' }, { 'x-noti-invitation': 'invite-one' })).status, 403);
  const created = await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  assert.equal(created.status, 200, await created.text());
  assert.equal(f.db.user!.length, 1); assert.equal(f.db.session!.length, 0);
  assert.equal(f.calls.filter(c => c.path.endsWith('/redeem')).length, 0);
  assert.equal(f.sent.length, 1);
  assert.equal((await f.request('/sign-in/email', signup)).status, 403);
  const url = new URL(f.sent[0]!.url);
  assert.equal((await f.service(new Request(url))).status, 302);
  assert.equal((await f.service(new Request(url))).status, 401);
  const login = await f.request('/sign-in/email', signup);
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = cookies(login);
  assert.match(cookie, /session_token/);
  const internal = () => f.service(new Request('http://127.0.0.1:3811/internal/session', {
    method: 'POST', headers: { host: '127.0.0.1:3811', authorization: `Bearer ${secret}`, cookie, 'x-user-id': 'spoof' },
  }));
  const session = await internal();
  assert.equal(session.status, 200); const wire = Session.parse(await session.json());
  assert.notEqual(wire.user_id, 'spoof'); assert.equal(Object.keys(wire).length, 4);
  for (const token of ['invite-one', 'invite-two']) {
    const redeem = await f.request('/invitations/redeem', { token }, { cookie, 'x-noti-csrf': '1' });
    assert.equal(redeem.status, 200, await redeem.clone().text());
    assert.equal((await redeem.json()).role, 'student');
  }
  assert.equal((await f.request('/invitations/redeem', { token: 'invite-one' }, { cookie, 'x-noti-csrf': '1' })).status, 403);
  assert.equal((await f.request('/invitations/redeem', { token: 'invite-one', role: 'admin' }, { cookie, 'x-noti-csrf': '1' })).status, 400);
  assert.equal((await f.request('/sign-out', {}, { cookie })).status, 200);
  assert.equal((await internal()).status, 401);
});

test('reset is single-use and revokes sessions; unknown-account recovery has the same response', async () => {
  const f = await fixture();
  await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  await f.service(new Request(f.sent[0]!.url));
  await f.request('/sign-in/email', signup);
  const known = await f.request('/request-password-reset', { email: signup.email, redirectTo: `${origin}/auth/reset` });
  const unknown = await f.request('/request-password-reset', { email: 'unknown@example.invalid', redirectTo: `${origin}/auth/reset` });
  assert.deepEqual(await known.json(), await unknown.json());
  const token = new URL(f.sent.at(-1)!.url).pathname.split('/').at(-1)!;
  const body = { token, newPassword: 'A-different-synthetic-password-456' };
  assert.equal((await f.request('/reset-password', body)).status, 200);
  assert.equal(f.db.session!.length, 0);
  assert.equal((await f.request('/reset-password', body)).status, 400);
  assert.equal((await f.request('/sign-in/email', signup)).status, 401);
});

test('disabled and failed mail never produce registration delivery success', async () => {
  for (const options of [{ mailEnabled: false }, { failMail: true }]) {
    const f = await fixture(options);
    const result = await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
    assert.equal(result.status, 503);
    assert.equal(f.sent.length, 0);
    assert.equal((await f.request('/request-password-reset', { email: signup.email })).status, 503);
  }
  const f = await fixture();
  assert.equal((await f.request('/sign-in/social', { provider: 'google' })).status, 503);
});

test('actual Better Auth built-in origin and callback checks stay enabled', async () => {
  const f = await fixture();
  const body = JSON.stringify(signup);
  for (const originHeader of ['https://evil.invalid', 'null', '']) {
    const response = await f.auth.handler(new Request(`${origin}/api/auth/sign-up/email`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-noti-peer-ip': f.peer, ...(originHeader ? { origin: originHeader } : {}) }, body,
    }));
    assert.equal(response.status, 403);
  }
  const invalidCallback = await f.request('/sign-up/email', { ...signup, callbackURL: 'https://evil.invalid' }, { 'x-noti-invitation': 'invite-one' });
  assert.equal(invalidCallback.status, 403); assert.equal(f.db.user!.length, 0);
});
