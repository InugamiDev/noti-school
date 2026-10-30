import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLandingSection, isSiteRoute, landingSections, parseHash, sitePages } from '../src/site/routes.ts';
import { questions } from '../src/site/faq.ts';
import { matchesQuery } from '../src/ui/lib/text.ts';

test('parseHash keeps app routes and maps landing anchors to the landing', () => {
  assert.deepEqual(parseHash(''), { route: '/', section: '' });
  assert.deepEqual(parseHash('#'), { route: '/', section: '' });
  assert.deepEqual(parseHash('#/'), { route: '/', section: '' });
  assert.deepEqual(parseHash('#/answer'), { route: '/answer', section: '' });
  assert.deepEqual(parseHash('#/auth?token=x'), { route: '/auth?token=x', section: '' });
  assert.deepEqual(parseHash('#/history/abc'), { route: '/history/abc', section: '' });
  assert.deepEqual(parseHash('#how'), { route: '/', section: 'how' });
  assert.deepEqual(parseHash('#join'), { route: '/', section: 'join' });
});

test('unknown in-page anchors fall back to the landing, unknown routes stay routes', () => {
  assert.deepEqual(parseHash('#main'), { route: '/', section: '' });
  assert.deepEqual(parseHash('#/synthetic-missing-page'), { route: '/synthetic-missing-page', section: '' });
});

test('site routes and sections are recognised by exact key only', () => {
  assert.equal(isSiteRoute('/help'), true);
  assert.equal(isSiteRoute('/help/x'), false);
  assert.equal(isSiteRoute('toString'), false);
  assert.equal(isLandingSection('faq'), true);
  assert.equal(isLandingSection('constructor'), false);
  assert.deepEqual(Object.keys(landingSections), ['how', 'reads', 'scope', 'roles', 'join', 'faq']);
});

test('public copy has no em or en dashes', () => {
  const copy = [...Object.values(sitePages).flat(), ...Object.values(landingSections), ...questions.flatMap(q => [q.question, q.answer, q.action])];
  for (const text of copy) assert.doesNotMatch(text, /[–—]/, text);
});

test('FAQ covers multi-university access and links only to known routes or landing sections', () => {
  const titles = questions.map(q => q.question);
  assert.ok(titles.includes('Which universities can use noti.school?'));
  assert.ok(titles.includes("Can I see another university's documents?"));
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  assert.ok(questions.filter(q => q.landing).length >= 5);
  const app = ['/answer', '/sources', '/history', '/auth', '/admin'];
  for (const { href } of questions) {
    const target = parseHash(href);
    assert.ok(target.section || isSiteRoute(target.route) || app.includes(target.route), href);
  }
});

test('FAQ filter ignores Vietnamese diacritics and case', () => {
  const hits = questions.filter(q => matchesQuery('TIENG VIET', q.question, q.answer));
  assert.deepEqual(hits.map(q => q.id), ['vietnamese']);
  assert.ok(questions.some(q => matchesQuery('another university', q.question, q.answer)));
});
