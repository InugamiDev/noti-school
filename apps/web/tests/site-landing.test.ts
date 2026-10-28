import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coverageText,
  heroLabel,
  membershipInstitution,
  requestRoles,
  sampleQuestions,
  schoolOptions,
  validateRequest,
  type InstitutionLike,
} from '../src/landing/logic.ts';
import { looksVietnamese } from '../src/ui/lib/prompt.ts';

const pilot: InstitutionLike = { id: 'a', slug: 'hcmiu', name: 'HCMIU', coverage: 'none' };
const demo: InstitutionLike = { id: 'b', slug: 'demo', name: 'Example institution, synthetic QA fixture', coverage: 'synthetic_demo' };
const approved: InstitutionLike = { id: 'c', slug: 'c', name: 'C', coverage: 'approved_sources' };

test('signed-out visitors see the listed institutions and nothing invented', () => {
  const schools = schoolOptions([pilot, demo], undefined);
  assert.deepEqual(schools.map(s => s.id), ['a', 'b']);
  assert.deepEqual(schools.map(s => s.status), ['pilot', 'demo']);
  assert.equal(schools[0]!.subtitle, 'Pilot collection, coverage not yet confirmed');
  assert.deepEqual(schoolOptions([], undefined), []);
});

test('signed-in accounts only see their own school', () => {
  const schools = schoolOptions([pilot, demo, approved], [{ institution_id: 'c' }]);
  assert.deepEqual(schools.map(s => s.name), ['C']);
  assert.equal(schools[0]!.subtitle, 'Approved sources available');
  // Membership outside the listed page falls back to the listed institutions rather than an empty picker.
  assert.deepEqual(schoolOptions([pilot], [{ institution_id: 'zzz' }]).map(s => s.id), ['a']);
});

test('membershipInstitution keeps a member institution and otherwise picks the first listed membership', () => {
  assert.equal(membershipInstitution('a', [pilot, approved], undefined), undefined);
  assert.equal(membershipInstitution('a', [pilot, approved], []), undefined);
  assert.equal(membershipInstitution('c', [pilot, approved], [{ institution_id: 'c' }]), 'c');
  assert.equal(membershipInstitution('a', [pilot, approved], [{ institution_id: 'x' }, { institution_id: 'c' }]), 'c');
  assert.equal(membershipInstitution('a', [pilot], [{ institution_id: 'x' }]), undefined);
});

test('coverage text covers every state, including an unavailable list', () => {
  assert.equal(coverageText('synthetic_demo'), 'Demo collection, synthetic examples only');
  assert.equal(coverageText(undefined), 'School list unavailable right now');
});

test('hero label prefers a short name, then the slug, then a truncated name', () => {
  assert.equal(heroLabel('HCMIU', 'hcmiu'), 'HCMIU');
  assert.equal(heroLabel(demo.name, demo.slug), 'DEMO');
  assert.equal(heroLabel('A very long university name', 'an-equally-long-slug'), 'A very long u…');
  assert.equal(heroLabel(undefined, undefined), 'Your school');
});

test('request form validation is inline and never treats an empty draft as sent', () => {
  assert.deepEqual(validateRequest({ university: '', role: requestRoles[0], email: '' }), {
    university: "Enter your university's name.",
    email: 'Enter a valid email address.',
  });
  assert.deepEqual(validateRequest({ university: 'X University', role: 'Student', email: 'not-an-email' }), {
    email: 'Enter a valid email address.',
  });
  assert.deepEqual(validateRequest({ university: '  X University ', role: 'Student', email: ' you@example.edu ' }), {});
});

test('sample questions include one Vietnamese question that switches the answer language', () => {
  assert.deepEqual(sampleQuestions.map(looksVietnamese), [false, true]);
});
