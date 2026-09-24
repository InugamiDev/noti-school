import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AskRequest, ANSWER_WAIT_MS, QUESTION_MAX_CHARACTERS, QUESTION_MAX_BYTES } from '@noti/contracts';
import { request, operationKey, clearOperations, invalidateRequests } from '../src/api.ts';
const id = '11111111-1111-4111-8111-111111111111';
test('frozen Unicode and control character boundary', () => {
  const parse = (question: string) => AskRequest.safeParse({ institution_id: id, question, language: 'vi' }).success;
  assert.equal(parse('😀'.repeat(QUESTION_MAX_CHARACTERS)), true);
  assert.equal(new TextEncoder().encode('😀'.repeat(QUESTION_MAX_CHARACTERS)).length, QUESTION_MAX_BYTES);
  assert.equal(parse('a'.repeat(QUESTION_MAX_CHARACTERS + 1)), false);
  for (const control of ['\0', '\u0001', '\u000b', '\u007f']) assert.equal(parse('question' + control), false);
  assert.equal(parse('Tôi\tmuốn\nbiết\rthêm'), true);
});
test('answer wait uses frozen allowance; ordinary requests remain short', async () => {
  const fetch = globalThis.fetch, timeout = AbortSignal.timeout;
  const durations: number[] = [];
  AbortSignal.timeout = ms => { durations.push(ms); return new AbortController().signal; };
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    await request('/api/v1/answers', null, { method: 'POST' });
    await request('/api/v1/me', null);
    assert.deepEqual(durations, [ANSWER_WAIT_MS, 45000]);
  } finally { globalThis.fetch = fetch; AbortSignal.timeout = timeout; }
});
test('exact payload/owner operation identity survives explicit replay, never conflict rotation', async () => {
  clearOperations();
  const body = { institution_id: id, question: 'Exact text ', language: 'en', discover: false };
  const first = await operationKey('A', body);
  assert.equal(await operationKey('A', body), first);
  assert.notEqual(await operationKey('B', body), first);
  assert.notEqual(await operationKey('A', { ...body, question: 'Exact text' }), first);
  assert.notEqual(await operationKey('A', { ...body, conversation_id: id }), first);
  assert.notEqual(await operationKey('A', { ...body, language: 'vi' }), first);
});
test('scope revocation aborts waits and rejects delayed response bodies', async () => {
  const fetch = globalThis.fetch;
  let finish!: (value: Response) => void;
  globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
  try {
    const pending = request('/api/v1/answers', AskRequest, { method: 'POST' });
    invalidateRequests();
    finish(new Response(JSON.stringify({ institution_id: id, question: 'private', language: 'en' })));
    await assert.rejects(pending, { name: 'AbortError' });
  } finally { globalThis.fetch = fetch; }
});
