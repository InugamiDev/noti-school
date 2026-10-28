import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSubmitPrompt, isPlainEnter, looksVietnamese, promptKeyAction } from '../src/ui/lib/prompt.ts';

const enter = { key: 'Enter', shiftKey: false, isComposing: false };

test('send is disabled for empty, whitespace-only, pending or over-limit drafts', () => {
  assert.equal(canSubmitPrompt('', false), false);
  assert.equal(canSubmitPrompt(' \n\t ', false), false);
  assert.equal(canSubmitPrompt('How do I register?', true), false);
  assert.equal(canSubmitPrompt('How do I register?', false), true);
  assert.equal(canSubmitPrompt('abcd', false, 3), false);
  assert.equal(canSubmitPrompt('abc', false, 3), true);
});

test('the limit counts code points, so emoji are not double counted', () => {
  assert.equal(canSubmitPrompt('😀😀😀', false, 3), true);
  assert.equal(canSubmitPrompt('😀😀😀😀', false, 3), false);
});

test('Enter submits a non-empty draft; Shift+Enter is left for a newline', () => {
  assert.equal(promptKeyAction(enter, 'Khi nào hạn rút môn học?', false), 'submit');
  assert.equal(promptKeyAction({ ...enter, shiftKey: true }, 'question', false), 'none');
  assert.equal(isPlainEnter({ ...enter, shiftKey: true }), false);
});

test('Enter never submits during IME composition, including the Safari keyCode 229 commit', () => {
  assert.equal(promptKeyAction({ ...enter, isComposing: true }, 'Khi nào', false), 'none');
  assert.equal(promptKeyAction({ ...enter, keyCode: 229 }, 'Khi nào', false), 'none');
  assert.equal(isPlainEnter({ ...enter, isComposing: true }), false);
  assert.equal(isPlainEnter({ ...enter, keyCode: 229 }), false);
});

test('Enter on an empty or pending draft does nothing but still swallows the newline', () => {
  assert.equal(promptKeyAction(enter, '   ', false), 'none');
  assert.equal(promptKeyAction(enter, 'question', true), 'none');
  assert.equal(isPlainEnter(enter), true);
});

test('Escape blurs unless composing; other keys do nothing', () => {
  assert.equal(promptKeyAction({ key: 'Escape', shiftKey: false, isComposing: false }, 'x', false), 'blur');
  assert.equal(promptKeyAction({ key: 'Escape', shiftKey: false, isComposing: true }, 'x', false), 'none');
  assert.equal(promptKeyAction({ key: 'a', shiftKey: false, isComposing: false }, 'x', false), 'none');
});

test('looksVietnamese detects Vietnamese-only letters', () => {
  assert.equal(looksVietnamese('Khi nào hạn rút môn học?'), true);
  assert.equal(looksVietnamese('Đăng ký'), true);
  assert.equal(looksVietnamese('How do I register for courses?'), false);
});
