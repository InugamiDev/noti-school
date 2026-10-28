import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingTimer } from '../src/ui/lib/loading.ts';

// Fake timers drive both setTimeout and Date.now, so the timer's clock and its scheduled callbacks stay in step.
function harness(options: Parameters<typeof createLoadingTimer>[1] = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const changes: boolean[] = [];
  const timer = createLoadingTimer((shown) => changes.push(shown), options);
  return { timer, changes, tick: (ms: number) => mock.timers.tick(ms) };
}

test('a response faster than the delay never shows the skeleton', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, changes, tick } = harness();
  timer.update(true);
  tick(149);
  timer.update(false);
  tick(1000);
  assert.deepEqual(changes, []);
  assert.equal(timer.shown(), false);
});

test('a slow response shows the skeleton after the delay', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, changes, tick } = harness();
  timer.update(true);
  tick(149);
  assert.equal(timer.shown(), false);
  tick(1);
  assert.equal(timer.shown(), true);
  assert.deepEqual(changes, [true]);
});

test('a shown skeleton stays for the minimum visible time', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, changes, tick } = harness();
  timer.update(true);
  tick(150);
  tick(50);
  timer.update(false);
  assert.equal(timer.shown(), true, 'held after loading ends');
  tick(349);
  assert.equal(timer.shown(), true);
  tick(1);
  assert.equal(timer.shown(), false);
  assert.deepEqual(changes, [true, false]);
});

test('a skeleton shown longer than the minimum hides as soon as loading ends', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, changes, tick } = harness();
  timer.update(true);
  tick(150);
  tick(500);
  timer.update(false);
  assert.equal(timer.shown(), false);
  assert.deepEqual(changes, [true, false]);
});

test('loading again during the hold keeps the skeleton without a flicker', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, changes, tick } = harness();
  timer.update(true);
  tick(200);
  timer.update(false);
  tick(100);
  timer.update(true);
  tick(1000);
  assert.equal(timer.shown(), true);
  assert.deepEqual(changes, [true]);
});

test('custom delay and minimum visible time are respected', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, tick } = harness({ delay: 50, minVisible: 100 });
  timer.update(true);
  tick(50);
  assert.equal(timer.shown(), true);
  timer.update(false);
  tick(99);
  assert.equal(timer.shown(), true);
  tick(1);
  assert.equal(timer.shown(), false);
});

test('a wait that began before mount continues instead of restarting the delay', (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const changes: boolean[] = [];
  const timer = createLoadingTimer((shown) => changes.push(shown), { since: 800 });
  timer.update(true);
  assert.equal(timer.shown(), true, '200 ms already waited, past the 150 ms delay');
  assert.deepEqual(changes, [true]);
});

test('a wait shorter than the delay before mount gets the full delay again', (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const timer = createLoadingTimer(() => undefined, { since: 900 });
  timer.update(true);
  assert.equal(timer.shown(), false);
  mock.timers.tick(149);
  assert.equal(timer.shown(), false, 'a fast second request after a remount still never flashes');
  mock.timers.tick(1);
  assert.equal(timer.shown(), true);
});

test('dispose cancels pending timers, as on unmount', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, changes, tick } = harness();
  timer.update(true);
  tick(100);
  timer.dispose();
  tick(1000);
  assert.deepEqual(changes, []);
  timer.update(true);
  tick(1000);
  assert.deepEqual(changes, [], 'no updates after dispose');
});

test('dispose during the minimum hold cancels the pending hide', (t) => {
  t.after(() => mock.timers.reset());
  const { timer, changes, tick } = harness();
  timer.update(true);
  tick(200);
  timer.update(false);
  timer.dispose();
  tick(1000);
  assert.deepEqual(changes, [true]);
});
