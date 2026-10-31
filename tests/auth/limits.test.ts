import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, config, cookies, origin, secret, signup } from './helpers.js';
import { createService, type SessionIdentity } from '../../apps/auth/src/service.js';
import { Admission } from '../../apps/auth/src/security.js';
import { recoveryMessage } from '../../apps/auth/src/auth.js';

const valid = (id: string): SessionIdentity => ({ user: { id, email: `${id}@example.invalid`, emailVerified: true },
  session: { id: `s-${id}`, userId: id, expiresAt: new Date(Date.now() + 60_000) } });

test('R5-01 invalid internal lookups cannot exhaust introspection for recently valid or other tokens', async () => {
  const f = await fixture(); let reads = 0;
  const service = createService({ config: config(), auth: f.auth, mail: f.mail, invitations: f.invitations, ready: async () => true,
    readSession: async headers => { reads++; const token = /session_token=(good-\w+)/.exec(headers.get('cookie') ?? '')?.[1]; return token ? valid(token) : null; } });
  const internal = (token: string, path = '/internal/session') => service(new Request(`http://127.0.0.1:3811${path}`, {
    method: 'POST', headers: { host: '127.0.0.1:3811', authorization: `Bearer ${secret}`, cookie: `better-auth.session_token=${token}` } }));
  assert.equal((await internal('good-a')).status, 200);
  for (let i = 0; i < 600; i++) assert.equal((await internal(`garbage-${i}`)).status, 401);
  reads = 0;
  assert.equal((await internal('garbage-next')).status, 429); assert.equal(reads, 0, 'Unknown tokens stop reaching the database');
  assert.equal((await internal('good-a')).status, 200, 'Recently valid session is unaffected by invalid traffic');
  assert.equal((await internal('x', '/internal/capabilities')).status, 200, 'Capability probes have a separate budget');
  // One token cannot consume another token's capacity.
  for (let i = 0; i < 298; i++) assert.equal((await internal('good-a')).status, 200);
  assert.equal((await internal('good-a')).status, 429);
  const g = await fixture();
  const other = createService({ config: config(), auth: g.auth, mail: g.mail, invitations: g.invitations, ready: async () => true,
    readSession: async headers => /good-b/.test(headers.get('cookie') ?? '') ? valid('b') : null });
  const call = (token: string) => other(new Request('http://127.0.0.1:3811/internal/session', {
    method: 'POST', headers: { host: '127.0.0.1:3811', authorization: `Bearer ${secret}`, cookie: `better-auth.session_token=${token}` } }));
  for (let i = 0; i < 300; i++) await call('flood');
  assert.equal((await call('flood')).status, 429); assert.equal((await call('good-b')).status, 200);
});

test('A-04a cookie-stripping clients cannot drain admission; issued cookies get their own quota', async () => {
  const admission = new Admission(), now = 1_800_000_000_000;
  for (let i = 0; i < 1000; i++) assert.equal(admission.identify(new Headers(), false, now).shared, true);
  const issued = admission.identify(new Headers({ cookie: 'noti.admission=forged' }), false, now);
  assert.equal(issued.shared, true); assert.ok(issued.cookie);
  const cookie = new Headers({ cookie: issued.cookie!.split(';')[0]! });
  assert.deepEqual(admission.identify(cookie, false, now), { id: issued.id, shared: false });
  const fresh = Array.from({ length: 120 }, () => new Headers({ cookie: admission.identify(new Headers(), false, now).cookie!.split(';')[0]! }));
  assert.ok(fresh.slice(0, 119).every(h => !admission.identify(h, false, now).shared));
  assert.equal(admission.identify(fresh[119]!, false, now).shared, true, 'Over-budget activation degrades to the shared key, not refusal');
  assert.equal(admission.identify(cookie, false, now).shared, false, 'Active admission survives activation exhaustion');
  assert.equal(admission.identify(cookie, false, now + 600_001).shared, true);
  const f = await fixture();
  let last: Response | undefined;
  for (let i = 0; i < 121; i++) last = await f.request('/get-session', undefined);
  assert.equal(last!.status, 429); assert.match(cookies(last!), /noti\.admission=/);
  assert.equal((await f.request('/get-session', undefined, { cookie: cookies(last!) })).status, 200);
});

test('A-04d a third party spends only its own pair quota before the absolute account ceiling', async () => {
  const f = await fixture();
  const clients: string[] = [];
  for (let i = 0; i < 7; i++) clients.push(cookies(await f.request('/get-session', undefined)));
  const login = (cookie: string) => f.request('/sign-in/email', { email: 'victim@example.invalid', password: 'wrong-password-123' }, { cookie });
  for (let i = 0; i < 10; i++) assert.equal((await login(clients[0]!)).status, 401);
  assert.equal((await login(clients[0]!)).status, 429);
  assert.equal((await login(clients[1]!)).status, 401, 'Victim on another client is not locked out by one attacker');
  for (const client of clients.slice(1, 5)) while ((await login(client)).status === 401);
  assert.equal((await login(clients[6]!)).status, 429, 'Absolute per-account ceiling still bounds distributed guessing');
});

test('A-04c/A-18 padded recovery leaves public slots free and normalizes account-dependent 4xx', async () => {
  const f = await fixture(); const waits: number[] = []; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service = createService({ config: f.cfg, auth: f.auth, mail: f.mail, invitations: f.invitations, ready: async () => true,
    pause: async ms => { waits.push(ms); await gate; } });
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => service(new Request(`${origin}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { origin, 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  const clients: string[] = [];
  for (let i = 0; i < 12; i++) clients.push(cookies(await request('/get-session')));
  const pending: Promise<Response>[] = [];
  // Two batches of 30: more than the 48 public slots end up waiting in padding at once.
  for (const batch of [0, 30]) {
    for (let i = batch; i < batch + 30; i++) pending.push(request('/request-password-reset', { email: `unknown-${i}@example.invalid` }, { cookie: clients[i % 12]! }));
    const deadline = Date.now() + 20_000;
    while (waits.length < batch + 30 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  }
  if (waits.length < 60) release();
  assert.equal(waits.length, 60);
  assert.equal((await request('/get-session', undefined, { cookie: clients[0]! })).status, 200, 'Padding does not hold public slots');
  assert.ok(waits.every(ms => ms > 8000));
  release();
  for (const response of await Promise.all(pending)) assert.deepEqual(await response.json(), recoveryMessage);
  // Invalid input and a signed-in already-verified session return the same padded response.
  await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  await f.service(new Request(f.sent[0]!.url));
  const session = cookies(await f.request('/sign-in/email', signup));
  waits.length = 0;
  for (const [body, cookie] of [[{ email: 'not-an-email' }, clients[1]!], [{ email: signup.email }, session]] as const) {
    const response = await request('/send-verification-email', body, { cookie });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), recoveryMessage);
  }
  assert.equal(waits.length, 2);
});

test('A-17 the unused deletion GET callback is not exposed', async () => {
  const f = await fixture();
  assert.equal((await f.request('/delete-user/callback?token=synthetic')).status, 404);
});
