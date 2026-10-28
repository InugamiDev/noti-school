import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands, groupCommands, moveActive, resolveCommandEnter, type CommandItem } from '../src/ui/lib/command.ts';
import { filterSchools, REQUEST_SCHOOL_ID, schoolOptionIds, type School } from '../src/ui/lib/school.ts';
import { isCommandShortcut, isMacPlatform, modifierLabel } from '../src/ui/lib/platform.ts';

const noop = () => {};
const items: CommandItem[] = [
  { id: 'ask', group: 'Actions', label: 'Ask a question', shortcut: '/', run: noop },
  { id: 'lang', group: 'Actions', label: 'Switch answer language', keywords: ['tiếng việt', 'english'], run: noop },
  { id: 'q1', group: 'Sample questions', label: 'How do I register for courses?', run: noop },
  { id: 'q2', group: 'Sample questions', label: 'Khi nào hạn rút môn học?', run: noop },
  { id: 'faq', group: 'Pages', label: 'Help and questions', run: noop },
];

test('filterCommands matches labels and keywords without diacritics', () => {
  assert.deepEqual(filterCommands(items, '').map(item => item.id), ['ask', 'lang', 'q1', 'q2', 'faq']);
  assert.deepEqual(filterCommands(items, 'han rut').map(item => item.id), ['q2']);
  assert.deepEqual(filterCommands(items, 'tieng viet').map(item => item.id), ['lang']);
  assert.deepEqual(filterCommands(items, 'QUESTION').map(item => item.id), ['ask', 'faq']);
  assert.deepEqual(filterCommands(items, 'nothing like this'), []);
});

test('groupCommands keeps first-seen group order and item order', () => {
  const grouped = groupCommands(filterCommands(items, ''));
  assert.deepEqual(
    grouped.map(group => [group.group, group.items.map(item => item.id)]),
    [
      ['Actions', ['ask', 'lang']],
      ['Sample questions', ['q1', 'q2']],
      ['Pages', ['faq']],
    ],
  );
});

test('moveActive wraps in both directions and survives empty lists', () => {
  assert.equal(moveActive(0, 1, 3), 1);
  assert.equal(moveActive(2, 1, 3), 0);
  assert.equal(moveActive(0, -1, 3), 2);
  assert.equal(moveActive(5, 1, 0), 0);
});

test('Enter runs the active match, falls back to asking unmatched text, and ignores blank input', () => {
  const shown = filterCommands(items, 'register');
  assert.deepEqual(resolveCommandEnter(shown, 0, 'register'), { kind: 'run', item: items[2] });
  assert.deepEqual(resolveCommandEnter([], 0, '  Học phí kỳ này?  '), { kind: 'fallback', text: 'Học phí kỳ này?' });
  assert.deepEqual(resolveCommandEnter([], 0, '   '), { kind: 'none' });
});

test('Cmd/Ctrl+K detection and platform modifier label', () => {
  const key = { key: 'k', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false };
  assert.equal(isCommandShortcut(key), true);
  assert.equal(isCommandShortcut({ ...key, ctrlKey: false, metaKey: true, key: 'K' }), true);
  assert.equal(isCommandShortcut({ ...key, ctrlKey: false }), false);
  assert.equal(isCommandShortcut({ ...key, shiftKey: true }), false);
  assert.equal(isMacPlatform('MacIntel'), true);
  assert.equal(isMacPlatform('iPhone'), true);
  assert.equal(modifierLabel('macOS'), 'Cmd');
  assert.equal(modifierLabel('Win32'), 'Ctrl');
  assert.equal(modifierLabel('Linux x86_64'), 'Ctrl');
  assert.equal(modifierLabel(''), 'Ctrl');
});

test('school filtering keeps the request option always reachable', () => {
  const schools: School[] = [
    { id: 'pilot-school', name: 'Pilot School', subtitle: 'Sample campus', status: 'pilot' },
    { id: 'another', name: 'Trường Mẫu', subtitle: 'Sample listing', status: 'available' },
  ];
  assert.deepEqual(schoolOptionIds(schools, ''), ['pilot-school', 'another', REQUEST_SCHOOL_ID]);
  assert.deepEqual(schoolOptionIds(schools, 'truong mau'), ['another', REQUEST_SCHOOL_ID]);
  assert.deepEqual(schoolOptionIds(schools, 'no such place'), [REQUEST_SCHOOL_ID]);
  assert.deepEqual(filterSchools([...schools, { id: REQUEST_SCHOOL_ID, name: 'x', subtitle: '', status: 'available' }], ''), schools);
});
