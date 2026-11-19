import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, signup, cookies, internalSession, secret } from './helpers.js';
import { createService } from '../../apps/auth/src/service.js';

test('flag on without mail: invited sign-up is verified at creation, sends no mail, then password sign-in and redeem work', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false });
  assert.equal((await f.request('/sign-up/email', signup)).status, 403, 'Missing invitation');
  assert.equal((await f.request('/sign-up/email', { ...signup, email: 'wrong@example.invalid' }, { 'x-noti-invitation': 'invite-one' })).status, 403);
  assert.equal((await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-unknown' })).status, 403);
  for (const extra of [{ emailVerified: true }, { role: 'admin' }]) {
    assert.equal((await f.request('/sign-up/email', { ...signup, ...extra }, { 'x-noti-invitation': 'invite-one' })).status, 403);
  }
  assert.equal(f.db.user!.length, 0);
  const created = await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  assert.equal(created.status, 200, await created.clone().text());
  // Chosen "now sign in" state: the account exists and is verified, but sign-up issues no session.
  const body = await created.json() as { token: unknown; user: { emailVerified: boolean } };
  assert.equal(body.token, null); assert.equal(body.user.emailVerified, true);
  assert.doesNotMatch(cookies(created), /session_token/);
  assert.equal(f.db.user!.length, 1); assert.equal(f.db.user![0]!.emailVerified, true);
  assert.equal(f.db.session!.length, 0); assert.equal(f.sent.length, 0);
  assert.equal(f.calls.filter(c => c.path.endsWith('/redeem')).length, 0, 'Sign-up checks but never consumes the invitation');
  const login = await f.request('/sign-in/email', signup);
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = cookies(login);
  assert.equal((await internalSession(f.service, cookie)).status, 200);
  const redeem = await f.request('/invitations/redeem', { token: 'invite-one' }, { cookie, 'x-noti-csrf': '1' });
  assert.equal(redeem.status, 200, await redeem.clone().text());
  assert.equal((await redeem.json()).role, 'student');
  // A used invitation no longer proves anything (fresh client: this one spent its sign-up pair quota above).
  const client = cookies(await f.request('/get-session'));
  assert.equal((await f.request('/sign-up/email', signup, { cookie: client, 'x-noti-invitation': 'invite-one' })).status, 403);
  // Recovery and deletion still need working mail.
  assert.equal((await f.request('/request-password-reset', { email: signup.email })).status, 503);
  assert.equal((await f.request('/delete-user', {}, { cookie })).status, 503);
});

test('flag off without mail keeps sign-up unavailable', async () => {
  const f = await fixture({ mailEnabled: false });
  const result = await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  assert.equal(result.status, 503);
  assert.equal((await result.json()).error.capability, 'email');
  assert.equal(f.db.user!.length, 0); assert.equal(f.sent.length, 0);
});

test('flag on with mail configured keeps the normal verification flow', async () => {
  const f = await fixture({ inviteVerifies: true });
  const created = await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  assert.equal(created.status, 200, await created.clone().text());
  assert.equal(f.db.user![0]!.emailVerified, false); assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0]!.kind, 'verification');
  assert.equal((await f.request('/sign-in/email', signup)).status, 403);
  assert.equal((await f.service(new Request(f.sent[0]!.url))).status, 302);
  assert.equal((await f.request('/sign-in/email', signup)).status, 200);
  // A failed transport stays a truthful 503 even with the flag on.
  const failing = await fixture({ inviteVerifies: true, failMail: true });
  assert.equal((await failing.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' })).status, 503);
});

test('identity capabilities report password and passkey per configuration and fail closed on core failure', async () => {
  const probe = async (options: { inviteVerifies?: boolean; passkeys?: boolean; ready?: boolean }) => {
    const f = await fixture({ inviteVerifies: options.inviteVerifies ?? false, passkeys: options.passkeys ?? true, mailEnabled: false });
    const service = createService({ config: f.cfg, auth: f.auth, mail: f.mail, invitations: f.invitations,
      ready: async () => options.ready ?? true });
    const response = await service(new Request('http://127.0.0.1:3811/internal/capabilities', {
      method: 'POST', headers: { host: '127.0.0.1:3811', authorization: `Bearer ${secret}` } }));
    assert.equal(response.status, 200);
    return await response.json() as Record<string, { state: string; reason: string }>;
  };
  const off = await probe({});
  assert.deepEqual(off.password, { state: 'disabled', reason: 'not_configured' });
  assert.deepEqual(off.passkey, { state: 'available', reason: 'ready' });
  const on = await probe({ inviteVerifies: true });
  assert.deepEqual(on.password, { state: 'available', reason: 'ready' });
  assert.deepEqual(on.passkey, { state: 'available', reason: 'ready' });
  const flagOff = await probe({ inviteVerifies: true, passkeys: false });
  assert.deepEqual(flagOff.passkey, { state: 'disabled', reason: 'not_configured' });
  const failed = await probe({ inviteVerifies: true, ready: false });
  for (const key of ['identity', 'password', 'passkey']) assert.deepEqual(failed[key], { state: 'unavailable', reason: 'core_failed' });
});
