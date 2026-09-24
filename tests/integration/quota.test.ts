import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import pg from 'pg';
import { toNodeHandler } from 'better-auth/node';
import { createIdentity } from '../../apps/auth/src/auth.js';
import { createService } from '../../apps/auth/src/service.js';
import { Admission, RateLimit } from '../../apps/auth/src/security.js';
import { readConfig } from '../../apps/auth/src/config.js';
import { Invitations } from '../../apps/auth/src/invitations.js';
import type { IdentityMail, Mailer } from '../../apps/auth/src/mail.js';
import { guardedRuntimeDatabase } from '../../scripts/database.js';
import { cookies, fixture, origin, secret } from '../auth/helpers.js';

test('bounded signed admission rejects forgery/expiry and does not accept forwarded identity', () => {
  const admission = new Admission(), now = 1_800_000_000_000;
  const first = admission.identify(new Headers(), true, now)!;
  assert.match(first.cookie!, /HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  const headers = new Headers({ cookie: first.cookie!.split(';')[0]! });
  for (let i = 1; i < 120; i++) assert.ok(admission.identify(new Headers({ 'x-forwarded-for': `192.0.2.${i}` }), false, now));
  assert.equal(admission.identify(new Headers({ cookie: 'noti.admission=forged', 'cf-connecting-ip': '192.0.2.1' }), false, now), null);
  assert.equal(admission.identify(headers, false, now)?.id, first.id, 'Issued admission survives issuance exhaustion');
  assert.notEqual(admission.identify(headers, false, now + 600_001)?.id, first.id);
  const limit = new RateLimit(2, 100, 2);
  assert.equal(limit.allow('a', 0), true); assert.equal(limit.allow('a', 0), true);
  assert.equal(limit.allow('a', 0), false); assert.equal(limit.allow('b', 0), true);
  assert.equal(limit.allow('c', 0), false); assert.equal(limit.allow('c', 101), true);
});

test('real HTTP and PostgreSQL identity: A cannot spend B session or Google callback quotas', async () => {
  assert.equal(process.env.NOTI_TEST_ACK, 'disposable-noti-school');
  const url = (role: string) => `postgresql://noti_school_${role}:synthetic-test-only@127.0.0.1:54390/noti_school_test_identity2`;
  const guard = await guardedRuntimeDatabase(url('auth'), url('auth_migrator'), 'auth', true); await guard.end();
  const pool = new pg.Pool({ connectionString: url('auth'), options: '-c search_path=auth', max: 5 });
  const emails = [0, 1, 2].map(() => `quota-${randomUUID()}@example.invalid`);
  const sent: IdentityMail[] = [];
  const mail: Mailer = { enabled: true, failed: false, close() {}, async send(value) { sent.push(value); } };
  const invitations = new Invitations(secret, async () => Response.json({ valid: true }));
  const config = readConfig({ NODE_ENV: 'test', AUTH_DATABASE_URL: url('auth'), BETTER_AUTH_SECRET: secret,
    INTERNAL_AUTH_SECRET: secret, GOOGLE_CLIENT_ID: 'synthetic', GOOGLE_CLIENT_SECRET: 'synthetic' });
  const auth = createIdentity(config, pool, mail, invitations);
  const context = await auth.$context;
  context.socialProviders[0]!.validateAuthorizationCode = async () => ({ accessToken: 'synthetic', scopes: ['openid', 'email', 'profile'] });
  context.socialProviders[0]!.getUserInfo = async () => ({ user: { email: emails[2]!, emailVerified: true, name: 'Synthetic quota callback' },
    data: { sub: randomUUID(), email: emails[2]!, email_verified: true } });
  const service = createService({ config, auth, mail, invitations, ready: async () => true, pause: async () => {} });
  const server = createServer(toNodeHandler(service)); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, cookie = '', body?: unknown, extra: Record<string, string> = {}) => fetch(`${base}/api/auth${path}`, {
    redirect: 'manual', method: body === undefined ? 'GET' : 'POST', headers: { origin, cookie, 'content-type': 'application/json', ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const sessions: string[] = [];
    for (const email of emails.slice(0, 2)) {
      const input = { email, password: 'Synthetic-quota-password-123', name: 'Synthetic quota student' };
      assert.equal((await request('/sign-up/email', '', input, { 'x-noti-invitation': 'synthetic-invite' })).status, 200);
      const verify = new URL(sent.at(-1)!.url);
      assert.equal((await request(`${verify.pathname.slice('/api/auth'.length)}${verify.search}`)).status, 302);
      const login = await request('/sign-in/email', '', input); assert.equal(login.status, 200);
      sessions.push(cookies(login));
    }
    const [a, b] = sessions as [string, string];
    const begin = await request('/sign-in/social', '', { provider: 'google', callbackURL: `${origin}/`, disableRedirect: true }, { 'x-noti-invitation': 'synthetic-invite' });
    assert.equal(begin.status, 200);
    const state = new URL((await begin.json()).url).searchParams.get('state')!;
    const callbackCookie = cookies(begin);
    for (let i = 0; i < 125; i++) {
      assert.equal((await request('/nonexistent', a)).status, 404);
      assert.equal((await request('/get-session', a, undefined, { 'x-user-id': 'spoof' })).status, 404);
      assert.equal((await request('/sign-in/email', a, {}, { origin: 'https://evil.invalid' })).status, 403);
    }
    assert.equal((await request('/get-session', b)).status, 200);
    for (let i = 0; i < 120; i++) assert.equal((await request('/get-session', a)).status, 200);
    assert.equal((await request('/get-session', a, undefined, { 'x-noti-peer-ip': '192.0.2.99', 'x-forwarded-for': '192.0.2.99' })).status, 429);
    const good = await request('/get-session', b); assert.equal(good.status, 200);
    assert.equal((await good.json()).user.email, emails[1]);
    for (let i = 0; i < 120; i++) assert.equal((await request('/callback/google?state=invalid&code=synthetic', a)).status, 403);
    assert.equal((await request('/callback/google?state=invalid&code=synthetic', a)).status, 429);
    const callback = await request(`/callback/google?state=${encodeURIComponent(state)}&code=synthetic`, callbackCookie);
    assert.equal(callback.status, 302);
    assert.match(cookies(callback), /session_token/);
    assert.equal((await pool.query('SELECT id FROM auth."user" WHERE email=$1', [emails[2]])).rowCount, 1);
    assert.equal((await request('/list-sessions', a)).status, 200, 'Unrelated flow remains usable');
    // Rotating admissions and spoofing IPs cannot bypass a target-account password limit.
    for (let i = 0; i < 10; i++) assert.equal((await request('/sign-in/email', '', { email: emails[0], password: 'wrong-password-123' }, { 'x-forwarded-for': `192.0.2.${i}` })).status, i === 9 ? 429 : 401);
    assert.equal((await request('/get-session', b)).status, 200);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.query('DELETE FROM auth."user" WHERE email=ANY($1::text[])', [emails]); await pool.end();
  }
});

test('public in-flight load is bounded independently from internal capabilities', async () => {
  const f = await fixture();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const service = createService({ config: f.cfg, auth: f.auth, mail: f.mail, invitations: f.invitations,
    ready: async () => true, readSession: async () => { await waiting; return null; } });
  const request = () => service(new Request(`${origin}/api/auth/get-session`));
  const pending = Array.from({ length: 48 }, request);
  assert.equal((await request()).status, 503);
  const internal = await service(new Request('http://127.0.0.1:3811/internal/capabilities', {
    method: 'POST', headers: { host: '127.0.0.1:3811', authorization: `Bearer ${secret}` },
  }));
  assert.equal(internal.status, 200);
  release(); assert.ok((await Promise.all(pending)).every(response => response.status === 200));
  assert.equal((await request()).status, 200);
});
