import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, config, origin, secret } from './helpers.js';
import { createService, type SessionIdentity } from '../../apps/auth/src/service.js';
import { authorized, RateLimit } from '../../apps/auth/src/security.js';
import { readConfig } from '../../apps/auth/src/config.js';
import { safeMailURL, smtpOptions } from '../../apps/auth/src/mail.js';
import { Invitations } from '../../apps/auth/src/invitations.js';

test('bearer, session expiry/verification, internal host and no spoofed identity', async () => {
  const f = await fixture(); let current: SessionIdentity | null = null; let reads = 0;
  const service = createService({ config: config(), auth: f.auth, mail: f.mail, invitations: f.invitations,
    ready: async () => true, readSession: async () => { reads++; return current; } });
  const request = (authorization?: string, host = '127.0.0.1:3811') => service(new Request('http://127.0.0.1:3811/internal/session', {
    method: 'POST', headers: { host, ...(authorization ? { authorization } : {}), 'x-user-id': 'spoof' },
  }));
  for (const bearer of [undefined, 'Bearer wrong', `Basic ${secret}`]) assert.equal((await request(bearer)).status, 401);
  assert.equal(reads, 0);
  assert.equal((await request(`Bearer ${secret}`, 'noti.school')).status, 404);
  assert.equal((await request(`Bearer ${secret}`)).status, 401);
  current = { user: { id: 'u', email: 'synthetic@example.invalid', emailVerified: true }, session: { id: 's', userId: 'u', expiresAt: new Date(0) } };
  assert.equal((await request(`Bearer ${secret}`)).status, 401);
  current.session.expiresAt = new Date(Date.now() + 10_000); current.user.emailVerified = false;
  assert.equal((await request(`Bearer ${secret}`)).status, 401);
  current.user.emailVerified = true; current.session.userId = 'spoof';
  assert.equal((await request(`Bearer ${secret}`)).status, 401);
  current.session.userId = 'u'; assert.equal((await request(`Bearer ${secret}`)).status, 200);
  current = null; assert.equal((await request(`Bearer ${secret}`)).status, 401);
  assert.equal(authorized(new Headers({ authorization: 'Bearer short' }), secret), false);
});

test('custom CSRF, credential header rejection, body limits and bounded rate table', async () => {
  const f = await fixture();
  assert.equal((await f.request('/invitations/redeem', { token: 'invite-one' })).status, 403);
  assert.equal((await f.request('/sign-in/email', {}, { origin: 'https://evil.invalid' })).status, 403);
  assert.equal((await f.request('/sign-in/email', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await f.request('/get-session', undefined, { authorization: `Bearer ${secret}` })).status, 404);
  assert.equal((await f.request('/sign-in/email', { oversized: 'x'.repeat(17000) })).status, 413);
  const limits = new RateLimit(1, 10, 1);
  assert.equal(limits.allow('a', 0), true); assert.equal(limits.allow('a', 0), false);
  assert.equal(limits.allow('b', 0), false); assert.equal(limits.allow('b', 11), true);
});

test('fixed config, certificate verification, safe mail origins and core unavailable', async () => {
  assert.throws(() => readConfig({ APP_ORIGIN: 'https://evil.invalid' }));
  assert.throws(() => readConfig({ NODE_ENV: 'production', APP_ORIGIN: origin }));
  const cfg = config();
  assert.equal(smtpOptions(cfg).tls.rejectUnauthorized, true);
  assert.equal(smtpOptions(cfg).requireTLS, true);
  cfg.env.SMTP_TLS_MODE = 'implicit';
  assert.equal(smtpOptions(cfg).secure, true); assert.equal(smtpOptions(cfg).requireTLS, false);
  assert.throws(() => safeMailURL('https://evil.invalid/reset', origin));
  assert.throws(() => safeMailURL(`${origin}/reset?callbackURL=https://evil.invalid`, origin));
  const f = await fixture();
  const service = createService({ config: readConfig({}), auth: null, mail: f.mail, invitations: f.invitations, ready: async () => false });
  assert.equal((await service(new Request(`${origin}/api/auth/get-session`))).status, 503);
  assert.equal((await service(new Request(`${origin}/healthz`))).status, 200);
});

test('Rust client uses fixed host/bearer/no redirects and fails closed on malformed or unavailable data', async () => {
  const client = new Invitations(secret, async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:3810/internal/invitations/check');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${secret}`);
    assert.equal(init?.redirect, 'error');
    return Response.json({ valid: true, role: 'admin' });
  });
  await assert.rejects(client.check('invite-one', 'invitee@example.invalid'), /unavailable/);
  await assert.rejects(new Invitations(secret, async () => { throw new Error('Synthetic timeout'); }).check('invite-one', 'invitee@example.invalid'), /unavailable/);
});
