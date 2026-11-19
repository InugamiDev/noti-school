import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture, signup, cookies, secret } from './helpers.js';

// intent: owner decision 2026-11-19, passkeys are off unless AUTH_PASSKEYS=true; password sign-in is unaffected.
// status: done
// next: none
// confidence: high (default fixture runs with the flag absent)
test('with AUTH_PASSKEYS absent passkey routes are unknown paths and password sign-in still works', async () => {
  const f = await fixture({ inviteVerifies: true, mailEnabled: false });
  assert.equal(f.cfg.configured.passkey, false);
  const capabilities = await f.service(new Request('http://127.0.0.1:3811/internal/capabilities', {
    method: 'POST', headers: { host: '127.0.0.1:3811', authorization: `Bearer ${secret}` } }));
  assert.equal(capabilities.status, 200);
  const body = await capabilities.json() as Record<string, { state: string; reason: string }>;
  assert.deepEqual(body.passkey, { state: 'disabled', reason: 'not_configured' });
  assert.deepEqual(body.password, { state: 'available', reason: 'ready' });

  assert.equal((await f.request('/sign-up/email', signup, { 'x-noti-invitation': 'invite-one' })).status, 200);
  const login = await f.request('/sign-in/email', signup);
  assert.equal(login.status, 200);
  const session = cookies(login);

  const unknown = await f.request('/no-such-route');
  assert.equal(unknown.status, 404);
  const shape = async (response: Response) => { const { error } = await response.json() as { error: { code: string; message: string; retryable: boolean } };
    return { code: error.code, message: error.message, retryable: error.retryable }; };
  const expected = await shape(unknown);
  for (const [path, body, headers] of [
    ['/passkey/generate-authenticate-options', undefined, {}],
    ['/passkey/generate-register-options', undefined, { cookie: session }],
    ['/passkey/verify-authentication', { response: { id: 'synthetic-credential' } }, {}],
    ['/passkey/verify-registration', { response: {} }, { cookie: session }],
    ['/passkey/list-user-passkeys', undefined, { cookie: session }],
    ['/passkey/delete-passkey', { id: 'x' }, { cookie: session }],
  ] as const) {
    const response = await f.request(path, body, headers);
    assert.equal(response.status, 404, path);
    assert.deepEqual(await shape(response), expected, path);
  }
  assert.equal(f.db.passkey!.length, 0);
});
