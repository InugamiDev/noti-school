import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AskRequest, ANSWER_WAIT_MS, QUESTION_MAX_CHARACTERS, QUESTION_MAX_BYTES } from '@noti/contracts';
import { request, operationKey, clearOperations, invalidateRequests, retireOperation, forgetOperations, isDefinitiveOutcome, isAuthError, RequestError } from '../src/api.ts';
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
test('definitive outcomes retire the identity; ambiguous ones keep it for explicit replay', async () => {
  clearOperations();
  const body = { institution_id: id, question: 'Retire me', language: 'en', discover: false };
  const other = { ...body, question: 'Keep me' };
  const first = await operationKey('A', body), kept = await operationKey('A', other);
  retireOperation(first);
  assert.notEqual(await operationKey('A', body), first);
  assert.equal(await operationKey('A', other), kept);
  forgetOperations();
  assert.notEqual(await operationKey('A', other), kept);
  for (const [status, code] of [[200, 'unavailable'], [400, 'invalid_request'], [401, 'unauthenticated'], [503, 'provider_unavailable'], [503, 'budget_exhausted']] as const)
    assert.equal(isDefinitiveOutcome(new RequestError('x', status, code)), true, `${status} ${code}`);
  for (const [status, code] of [[0, 'unavailable'], [409, 'conflict'], [500, 'internal_error'], [503, 'core_unavailable'], [502, 'unavailable']] as const)
    assert.equal(isDefinitiveOutcome(new RequestError('x', status, code)), false, `${status} ${code}`);
  assert.equal(isDefinitiveOutcome(new DOMException('stopped', 'AbortError')), false);
  assert.equal(isAuthError(new RequestError('x', 401, 'unauthenticated')), true);
  assert.equal(isAuthError(new RequestError('x', 503, 'provider_unavailable')), false);
});
test('timeout while reading the body is a visible non-final wait failure', async () => {
  const fetch = globalThis.fetch, timeout = AbortSignal.timeout;
  let clock!: AbortController;
  AbortSignal.timeout = () => { clock = new AbortController(); return clock.signal; };
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: () => { clock.abort(new DOMException('timed out', 'TimeoutError')); return Promise.reject(new DOMException('aborted', 'AbortError')); } }) as unknown as Response;
    await assert.rejects(request('/api/v1/answers', null, { method: 'POST' }), (e: unknown) => e instanceof RequestError && e.message.includes('Processing may continue'));
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { clock.abort(new DOMException('timed out', 'TimeoutError')); return {}; } }) as unknown as Response;
    await assert.rejects(request('/api/v1/answers', null, { method: 'POST' }), (e: unknown) => e instanceof RequestError && e.message.includes('Processing may continue'));
  } finally { globalThis.fetch = fetch; AbortSignal.timeout = timeout; }
});
test('signal combination works without AbortSignal.any', async () => {
  const fetch = globalThis.fetch, any = AbortSignal.any;
  Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true });
  let seen: AbortSignal | undefined;
  globalThis.fetch = (_input, init) => { seen = init?.signal ?? undefined; return new Promise((_, reject) => seen!.addEventListener('abort', () => reject(seen!.reason))); };
  try {
    const caller = new AbortController();
    const pending = request('/api/v1/answers', null, { method: 'POST', signal: caller.signal });
    caller.abort(new DOMException('stopped', 'AbortError'));
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(seen?.aborted, true);
  } finally { globalThis.fetch = fetch; Object.defineProperty(AbortSignal, 'any', { value: any, configurable: true, writable: true }); }
});
