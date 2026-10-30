import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveInstitutions, deriveSession } from '../src/app/session.ts';

test('identity is loading until the first read settles', () => {
  assert.equal(deriveSession({ loading: true, present: false }), 'loading');
  assert.equal(deriveSession({ loading: true, present: false }, 'loading'), 'loading');
});

test('a settled identity read is signed in or signed out', () => {
  assert.equal(deriveSession({ loading: false, present: true }, 'loading'), 'signed-in');
  // An error or an empty response both settle as signed out.
  assert.equal(deriveSession({ loading: false, present: false }, 'loading'), 'signed-out');
});

test('a background refetch keeps the previous settled identity state', () => {
  assert.equal(deriveSession({ loading: true, present: false }, 'signed-out'), 'signed-out');
  assert.equal(deriveSession({ loading: true, present: true }, 'signed-in'), 'signed-in');
});

test('identity changes once the refetch settles', () => {
  assert.equal(deriveSession({ loading: false, present: false }, 'signed-in'), 'signed-out');
  assert.equal(deriveSession({ loading: false, present: true }, 'signed-out'), 'signed-in');
});

test('an identity outage is unavailable, not signed out', () => {
  assert.equal(deriveSession({ loading: false, present: false, failed: true }, 'loading'), 'unavailable');
  assert.equal(deriveSession({ loading: false, present: false, failed: true }, 'signed-in'), 'unavailable');
  assert.equal(deriveSession({ loading: true, present: false, failed: true }, 'unavailable'), 'unavailable');
  assert.equal(deriveSession({ loading: false, present: true, failed: false }, 'unavailable'), 'signed-in');
});

test('the school list is loading, ready or unavailable', () => {
  assert.equal(deriveInstitutions({ loading: true, present: false }), 'loading');
  assert.equal(deriveInstitutions({ loading: false, present: true }, 'loading'), 'ready');
  assert.equal(deriveInstitutions({ loading: false, present: false }, 'loading'), 'unavailable');
  assert.equal(deriveInstitutions({ loading: true, present: false }, 'unavailable'), 'unavailable');
  assert.equal(deriveInstitutions({ loading: true, present: true }, 'ready'), 'ready');
});
