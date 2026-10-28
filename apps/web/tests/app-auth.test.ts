import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authErrors, authFields, authModes } from '../src/app/auth.ts';

const empty = { email: '', name: '', password: '', token: '' };

test('each mode shows only its own fields', () => {
  assert.deepEqual(authFields('Sign in'), ['email', 'password']);
  assert.deepEqual(authFields('Create account'), ['email', 'name', 'password', 'token']);
  assert.deepEqual(authFields('Redeem invitation'), ['token']);
  assert.deepEqual(authFields('Verify email'), ['email']);
  assert.deepEqual(authFields('Reset password'), ['email', 'password', 'token']);
  assert.equal(authModes.length, 5);
});

test('sign in requires email and a 12 to 128 character password', () => {
  assert.deepEqual(Object.keys(authErrors('Sign in', empty, '')).sort(), ['email', 'password']);
  assert.ok(authErrors('Sign in', { ...empty, email: 'a@b', password: 'short' }, '').password);
  assert.ok(authErrors('Sign in', { ...empty, email: 'not-an-email', password: 'x'.repeat(12) }, '').email);
  assert.deepEqual(authErrors('Sign in', { ...empty, email: 'a@b.test', password: 'x'.repeat(12) }, ''), {});
  assert.ok(authErrors('Sign in', { ...empty, email: 'a@b.test', password: 'x'.repeat(129) }, '').password);
});

test('create account requires name and invitation token', () => {
  const errors = authErrors('Create account', { ...empty, email: 'a@b.test', password: 'x'.repeat(12) }, '');
  assert.deepEqual(Object.keys(errors).sort(), ['name', 'token']);
  assert.ok(authErrors('Create account', { email: 'a@b.test', password: 'x'.repeat(12), name: 'n'.repeat(101), token: 't' }, '').name);
});

test('reset password: email alone requests a link; a reset token needs a new password instead', () => {
  assert.deepEqual(authErrors('Reset password', { ...empty, email: 'a@b.test' }, ''), {});
  assert.ok(authErrors('Reset password', empty, '').email);
  assert.deepEqual(Object.keys(authErrors('Reset password', empty, 'synthetic-token')), ['password']);
  assert.deepEqual(authErrors('Reset password', { ...empty, password: 'x'.repeat(12) }, 'synthetic-token'), {});
});

test('redeem invitation needs a bounded token only', () => {
  assert.ok(authErrors('Redeem invitation', empty, '').token);
  assert.ok(authErrors('Redeem invitation', { ...empty, token: 't'.repeat(257) }, '').token);
  assert.deepEqual(authErrors('Redeem invitation', { ...empty, token: 'synthetic' }, ''), {});
});
