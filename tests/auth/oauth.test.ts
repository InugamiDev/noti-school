import assert from 'node:assert/strict';
import test from 'node:test';
import { getSchema } from 'better-auth/db';
import { fixture, cookies, origin, signup } from './helpers.js';

async function oauthFixture(email = signup.email, verified = true) {
  const f = await fixture({ google: true });
  const provider = f.context.socialProviders[0]!;
  // Replace only the provider transport/profile boundary; the real handler, state, hooks and adapter run.
  provider.validateAuthorizationCode = async () => ({ accessToken: 'synthetic-access', scopes: ['openid', 'email', 'profile'] });
  provider.getUserInfo = async () => ({ user: { email, emailVerified: verified, name: 'Synthetic Google invitee' },
    data: { sub: 'synthetic-google-id', email, email_verified: verified } });
  async function begin(token?: string) {
    const response = await f.request('/sign-in/social', { provider: 'google', callbackURL: `${origin}/`, disableRedirect: true }, token ? { 'x-noti-invitation': token } : {});
    assert.equal(response.status, 200, await response.clone().text());
    const state = new URL((await response.json()).url).searchParams.get('state')!;
    const cookie = cookies(response);
    return { state, cookie, callback: (stateValue = state, cookieValue = cookie) => f.service(new Request(
      `${origin}/api/auth/callback/google?state=${encodeURIComponent(stateValue)}&code=synthetic-code`,
      { headers: { cookie: cookieValue, 'x-noti-peer-ip': f.peer } },
    )) };
  }
  return { ...f, begin };
}

test('Google creation uses browser-bound server state and checks invitation; replay cannot create session', async () => {
  const f = await oauthFixture(); const flow = await f.begin('invite-one');
  assert.equal((await flow.callback('tampered')).status, 403);
  assert.equal((await flow.callback(flow.state, '')).status, 403);
  const result = await flow.callback();
  assert.equal(result.status, 302, await result.clone().text());
  assert.equal(f.db.user!.length, 1, result.headers.get('location') ?? 'no location');
  assert.equal(f.db.session!.length, 1);
  assert.equal(f.calls.filter(c => c.path.endsWith('/check')).length, 1);
  assert.equal(f.calls.filter(c => c.path.endsWith('/redeem')).length, 0);
  assert.equal((await flow.callback()).status, 403);
  assert.equal(f.db.session!.length, 1);
  const returning = await f.begin();
  assert.equal((await returning.callback()).status, 302);
  assert.equal(f.db.user!.length, 1);
});

test('OAuth no invite, wrong email, expired state, and unverified profile cannot create accounts', async () => {
  for (const [email, verified, token] of [
    [signup.email, true, undefined], ['wrong@example.invalid', true, 'invite-one'], [signup.email, false, 'invite-one'],
  ] as const) {
    const f = await oauthFixture(email, verified); const flow = await f.begin(token);
    await flow.callback(); assert.equal(f.db.user!.length, 0); assert.equal(f.db.session!.length, 0);
  }
  const f = await oauthFixture(); const flow = await f.begin('invite-one');
  for (const record of f.db.verification!) record.expiresAt = new Date(0);
  assert.equal((await flow.callback()).status, 403); assert.equal(f.db.user!.length, 0);
});

test('OAuth caller cannot inject server state, role, id-token shortcut or automatic email linking', async () => {
  const f = await oauthFixture();
  for (const extra of [{ additionalData: { serverContext: { invitation: { token: 'invite-one' } } } }, { role: 'admin' }, { idToken: { token: 'fake' } }]) {
    assert.equal((await f.request('/sign-in/social', { provider: 'google', ...extra })).status, 403);
  }
  const separate = await oauthFixture();
  await separate.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' });
  const flow = await separate.begin('invite-one'); await flow.callback();
  assert.equal(separate.db.user!.length, 1); assert.equal(separate.db.account!.length, 1);
  assert.equal(separate.db.account![0]!.providerId, 'credential'); assert.equal(separate.db.session!.length, 0);
});

test('configured auth schema matches foundation core schema, secure cookies and cache settings', async () => {
  const f = await fixture();
  const actual = getSchema(f.auth.options);
  const foundation = getSchema({ emailAndPassword: { enabled: true }, session: { cookieCache: { enabled: false } } });
  assert.deepEqual(Object.keys(actual).sort(), ['account', 'session', 'user', 'verification']);
  for (const table of Object.keys(foundation)) assert.deepEqual(Object.keys(actual[table]!.fields).sort(), Object.keys(foundation[table]!.fields).sort());
  assert.equal(f.auth.options.session?.cookieCache?.enabled, false);
  assert.equal(f.auth.options.account?.accountLinking?.enabled, false);
  assert.equal(f.auth.options.account?.storeStateStrategy, 'database');
  assert.equal(f.auth.options.advanced?.defaultCookieAttributes?.httpOnly, true);
  assert.equal(f.auth.options.advanced?.defaultCookieAttributes?.sameSite, 'lax');
});
