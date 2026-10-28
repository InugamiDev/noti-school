import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerPresentation,
  citationText,
  effectiveText,
  evidenceLocator,
  filterSources,
  isAccessCode,
  isUnavailableCode,
  locatorText,
  sourceBadge,
  versionBadge,
} from '../src/app/workspace.ts';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const time = '2026-09-25T00:00:00Z';
const version = (status: 'draft' | 'quarantined' | 'pending_review' | 'approved' | 'archived' | 'failed', until: string | null = null) => ({
  id,
  source_id: other,
  institution_id: other,
  label: 'Synthetic v1',
  sha256: 'a'.repeat(64),
  status,
  indexing: 'ready' as const,
  effective_from: null,
  effective_until: until,
  created_at: time,
});
const evidence = {
  id,
  source_id: other,
  version_id: other,
  chunk_id: other,
  institution_id: other,
  title: 'Sample Student Handbook',
  version_label: '2025 edition',
  locator: { page: 31, section: '4.2', start_char: 0, end_char: 10 },
  quote: 'Synthetic quote',
  original_url: null,
};

test('answer statuses stay visually distinct and never claim verification', () => {
  const answered = answerPresentation('answered');
  const qualified = answerPresentation('qualified');
  const abstained = answerPresentation('abstained');
  assert.equal(answered.card, 'answer');
  assert.equal(qualified.card, 'answer');
  assert.equal(abstained.card, 'no-answer');
  assert.equal(new Set([answered.tone, qualified.tone, abstained.tone]).size, 3);
  assert.equal(new Set([answered.label, qualified.label, abstained.label]).size, 3);
  for (const view of [answered, qualified, abstained]) assert.doesNotMatch(view.label, /verif/i);
});

test('only provider and core outages use the unavailable answer state', () => {
  for (const code of ['provider_unavailable', 'budget_exhausted', 'pricing_unavailable', 'core_unavailable'])
    assert.equal(isUnavailableCode(code), true, code);
  for (const code of [undefined, 'cancelled', 'conflict', 'invalid_request', 'unauthenticated', 'unavailable'])
    assert.equal(isUnavailableCode(code), false, String(code));
  assert.equal(isAccessCode('unauthenticated'), true);
  assert.equal(isAccessCode('forbidden'), true);
  assert.equal(isAccessCode('provider_unavailable'), false);
});

test('locators and copied citations name document, version, page and section', () => {
  assert.equal(locatorText(evidence.locator), 'Page 31 · 4.2');
  assert.equal(locatorText({ ...evidence.locator, page: null }), '4.2');
  assert.equal(locatorText({ ...evidence.locator, section: null }), 'Page 31');
  assert.equal(evidenceLocator(evidence), 'Sample Student Handbook · 2025 edition · Page 31 · 4.2');
  assert.equal(citationText(evidence), 'Sample Student Handbook, 2025 edition, Page 31 · 4.2');
});

test('version badges: approved current, superseded, expired, under review, archived, failed', () => {
  const now = Date.parse('2026-10-28T00:00:00Z');
  assert.deepEqual(versionBadge(version('approved'), id, now), { label: 'Approved', tone: 'sage' });
  assert.deepEqual(versionBadge(version('approved'), other, now), { label: 'Superseded', tone: 'neutral' });
  assert.deepEqual(versionBadge(version('approved', '2025-01-01T00:00:00Z'), id, now), { label: 'Approved, expired', tone: 'neutral' });
  assert.equal(versionBadge(version('pending_review'), id, now).label, 'Under review');
  assert.equal(versionBadge(version('quarantined'), id, now).label, 'Under review');
  assert.equal(versionBadge(version('archived'), id, now).label, 'Archived');
  assert.equal(versionBadge(version('failed'), id, now).tone, 'danger');
  assert.equal(versionBadge(version('approved'), undefined, now).label, 'Approved');
});

test('source badge reflects whether a current version exists', () => {
  const source = { id, institution_id: other, title: 'T', kind: 'pdf' as const, original_url: null, visibility: 'institution' as const, current_version_id: other, created_at: time };
  assert.equal(sourceBadge(source).tone, 'sage');
  assert.equal(sourceBadge({ ...source, current_version_id: null }).label, 'Awaiting a current version');
});

test('effective dates read as words without dash ranges', () => {
  const text = effectiveText('2025-01-01T00:00:00Z', null, () => 'D');
  assert.equal(text, 'Effective from D, no end date supplied.');
  assert.doesNotMatch(effectiveText(null, '2025-01-01T00:00:00Z', () => 'D'), /[–—-]/);
});

test('source filter ignores case and Vietnamese diacritics and matches the format', () => {
  const items = [
    { title: 'Quy chế đào tạo', kind: 'pdf' as const },
    { title: 'Student Handbook', kind: 'text' as const },
    { title: 'Admissions page', kind: 'url' as const },
  ];
  assert.deepEqual(filterSources(items, 'quy che dao tao').map(i => i.title), ['Quy chế đào tạo']);
  assert.deepEqual(filterSources(items, 'HANDBOOK').map(i => i.title), ['Student Handbook']);
  assert.deepEqual(filterSources(items, 'web page').map(i => i.title), ['Admissions page']);
  assert.equal(filterSources(items, '').length, 3);
});
