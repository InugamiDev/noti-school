import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, signup } from './helpers.js';
import { digest } from '../../apps/auth/src/security.js';

test('verification tampering, expiration and concurrent replay fail closed with library verification', async () => {
  const f = await fixture();
  await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  const url = new URL(f.sent[0]!.url); const token = url.searchParams.get('token')!;
  const tampered = new URL(url); tampered.searchParams.set('token', `${token}x`);
  assert.equal((await f.service(new Request(tampered))).status, 401);
  assert.equal(f.db.user![0]!.emailVerified, false);
  const outcomes = await Promise.all([f.service(new Request(url)), f.service(new Request(url))]);
  assert.deepEqual(outcomes.map(r => r.status).sort(), [302, 401]);
  assert.equal(f.db.user![0]!.emailVerified, true);
  const other = await fixture();
  await other.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  const otherURL = new URL(other.sent[0]!.url); const otherToken = otherURL.searchParams.get('token')!;
  const marker = other.db.verification!.find(row => row.identifier === `noti-email:${digest(otherToken)}`)!;
  marker.expiresAt = new Date(0);
  assert.equal((await other.service(new Request(otherURL))).status, 401);
  assert.equal(other.db.user![0]!.emailVerified, false);
});

test('concurrent reset consumes one token; expired reset does not change credentials', async () => {
  const f = await fixture();
  await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  await f.service(new Request(f.sent[0]!.url));
  await f.request('/request-password-reset', { email: signup.email });
  const token = new URL(f.sent.at(-1)!.url).pathname.split('/').at(-1)!;
  const outcomes = await Promise.all([1, 2].map(() => f.request('/reset-password', { token, newPassword: 'Synthetic-replacement-passphrase' })));
  assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 400]);
  await f.request('/request-password-reset', { email: signup.email });
  const expired = new URL(f.sent.at(-1)!.url).pathname.split('/').at(-1)!;
  for (const value of f.db.verification!) if (value.identifier === `reset-password:${expired}`) value.expiresAt = new Date(0);
  assert.equal((await f.request('/reset-password', { token: expired, newPassword: 'Another-synthetic-password' })).status, 400);
});
