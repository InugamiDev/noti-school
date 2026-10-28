import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesQuery, normalizeVi } from '../src/ui/lib/text.ts';

test('normalizeVi strips Vietnamese diacritics, maps đ to d and lowercases', () => {
  assert.equal(normalizeVi('Khi nào hạn rút môn học?'), 'khi nao han rut mon hoc?');
  assert.equal(normalizeVi('Đăng ký học phần'), 'dang ky hoc phan');
  assert.equal(normalizeVi('đường ĐI'), 'duong di');
  assert.equal(normalizeVi('Ữ Ỳ Ỡ ặ ế'), 'u y o a e');
});

test('normalizeVi handles precomposed and decomposed input identically', () => {
  const composed = 'Tiếng Việt'.normalize('NFC');
  const decomposed = 'Tiếng Việt'.normalize('NFD');
  assert.equal(normalizeVi(composed), normalizeVi(decomposed));
  assert.equal(normalizeVi(composed), 'tieng viet');
});

test('normalizeVi collapses whitespace and leaves plain ASCII alone', () => {
  assert.equal(normalizeVi('  How   do I\tregister?  '), 'how do i register?');
  assert.equal(normalizeVi(''), '');
});

test('matchesQuery ignores diacritics and case and needs every term', () => {
  assert.equal(matchesQuery('han rut', 'Khi nào hạn rút môn học?'), true);
  assert.equal(matchesQuery('HẠN RÚT', 'khi nao han rut mon hoc'), true);
  assert.equal(matchesQuery('dang ky', 'Đăng ký học phần'), true);
  assert.equal(matchesQuery('rut deadline', 'Khi nào hạn rút môn học?'), false);
  assert.equal(matchesQuery('register', 'Sample', 'How do I register?'), true);
  assert.equal(matchesQuery('   ', 'anything'), true);
});
