import test from 'node:test';
import assert from 'node:assert/strict';
import { Accounts } from '../../apps/auth/src/accounts.js';
import { secret } from './helpers.js';

test('cleanup client validates the exact contract and fails closed on malformed, oversized or unavailable responses', async () => {
  for (const response of [
    Response.json({ deleted: false }), Response.json({ deleted: true, extra: 'unknown' }),
    Response.json({}, { status: 503 }), new Response('x'.repeat(4097)), new Response(null, { status: 204 }),
  ]) await assert.rejects(new Accounts(secret, async () => response).delete('synthetic'));
  let calls = 0;
  const client = new Accounts(secret, async (url, init) => {
    calls++; assert.equal(String(url), 'http://127.0.0.1:3810/internal/accounts/delete');
    assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    assert.deepEqual(JSON.parse(String(init?.body)), { user_id: 'synthetic' });
    return Response.json({ deleted: true });
  });
  await client.delete('synthetic'); assert.equal(calls, 1);
  await assert.rejects(client.delete('x'.repeat(257))); assert.equal(calls, 1);
});
