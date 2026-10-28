import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_FOV, EVIDENCE_LINE, LINE_WIDTHS, PALETTE, SLOT_LIFT,
  approach, capPixelRatio, fitDistance, lineCenter, lineZ, normalisedPointer, pinTarget, scopeLayout, viewOffsetY, worldRotationTarget,
} from '../src/hero3d/layout.ts';

const close = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);

test('fit distance uses the vertical field on wide stages and the horizontal field on tall ones', () => {
  const half = (CAMERA_FOV * Math.PI) / 360;
  close(fitDistance(5, CAMERA_FOV, 16 / 11), 5 / Math.sin(half));
  const tall = 0.5;
  close(fitDistance(5, CAMERA_FOV, tall), 5 / Math.sin(Math.atan(Math.tan(half) * tall)));
  assert.ok(fitDistance(5, CAMERA_FOV, tall) > fitDistance(5, CAMERA_FOV, 16 / 11));
  assert.throws(() => fitDistance(0, CAMERA_FOV, 1), RangeError);
  assert.throws(() => fitDistance(5, CAMERA_FOV, 0), RangeError);
});

test('view offset shifts less on narrow stages', () => {
  close(viewOffsetY(519, 400), 40);
  close(viewOffsetY(520, 400), 52);
  close(viewOffsetY(1200, 825), 825 * 0.13);
});

test('pin rests on the cited evidence line, 62% along its width', () => {
  for (const citation of ['a', 'b'] as const) {
    const index = EVIDENCE_LINE[citation];
    const p = pinTarget(citation);
    close(p.x, -0.64 + (LINE_WIDTHS[index] ?? NaN) * 0.62);
    close(p.y, 0.04);
    close(p.z, lineZ(index));
  }
  close(pinTarget('a').z, -0.82 + 3 * 0.23);
  close(pinTarget('b').z, -0.82 + 5 * 0.23);
  assert.notDeepEqual(pinTarget('a'), pinTarget('b'));
  close(lineCenter(0).x, -0.64 + 0.6);
  assert.throws(() => lineCenter(LINE_WIDTHS.length), RangeError);
});

test('scope layout lifts and colours the selected slot only', () => {
  const active = scopeLayout('active');
  assert.equal(active.slots.active.lift, SLOT_LIFT);
  assert.equal(active.slots.next.lift, 0);
  assert.equal(active.slots.locked.lift, 0);
  assert.equal(active.slots.active.palette, PALETTE.active);
  assert.equal(active.slots.next.palette, PALETTE.ghost);
  assert.equal(active.slots.next.opacity, 0.5);
  assert.equal(active.pageVisible, true);

  const request = scopeLayout('request');
  assert.equal(request.slots.active.lift, 0);
  assert.equal(request.slots.next.lift, SLOT_LIFT);
  assert.equal(request.slots.active.palette, PALETTE.grey);
  assert.equal(request.slots.next.palette, PALETTE.next);
  assert.equal(request.slots.next.opacity, 0.95);
  assert.equal(request.pageVisible, false);
  assert.equal(request.slots.locked.palette, undefined);
});

test('pixel ratio is capped at 2 and sanitised', () => {
  assert.equal(capPixelRatio(1), 1);
  assert.equal(capPixelRatio(1.5), 1.5);
  assert.equal(capPixelRatio(3), 2);
  assert.equal(capPixelRatio(Number.NaN), 1);
  assert.equal(capPixelRatio(0), 1);
});

test('tween, pointer and parallax helpers', () => {
  close(approach(0, 1, 0.1), 0.1);
  assert.equal(approach(0.3, 1, 1), 1);
  assert.deepEqual(normalisedPointer(150, 50, { left: 100, top: 0, width: 100, height: 100 }), { x: 0, y: 0 });
  assert.deepEqual(normalisedPointer(200, 100, { left: 100, top: 0, width: 100, height: 100 }), { x: 1, y: 1 });
  assert.deepEqual(normalisedPointer(1, 1, { left: 0, top: 0, width: 0, height: 0 }), { x: 0, y: 0 });
  const still = worldRotationTarget({ x: 0, y: 0 }, 0);
  close(still.x, 0);
  close(still.y, 0);
  const right = worldRotationTarget({ x: 1, y: -1 }, 0);
  close(right.y, 0.16);
  close(right.x, -0.05);
});
