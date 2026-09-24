import test from 'node:test';
import assert from 'node:assert/strict';
import { estimate } from '../../packages/contracts/src/budget.js';
const now = new Date('2026-09-25T00:00:00Z');
const prices = ['input', 'output', 'embedding', 'tool', 'jev'].map(id => ({ id, microUsdPerMillionUnits: 1500000n, validUntil: '2026-10-01T00:00:00Z' }));
test('integer rounding includes every charged component conservatively', () => {
  assert.equal(estimate(prices.map(p => ({ priceId: p.id, units: 1n })), prices, now), 10n);
});
test('explicit free components remain priced and included in a paid plan', () => {
  const mixedPrices = [...prices, { id: 'free-output', microUsdPerMillionUnits: 0n, validUntil: '2026-10-01T00:00:00Z' }];
  assert.equal(estimate([{ priceId: 'input', units: 1n }, { priceId: 'free-output', units: 100n }], mixedPrices, now), 2n);
  assert.throws(() => estimate([{ priceId: 'free-output', units: 100n }], mixedPrices, now));
  assert.throws(() => estimate([{ priceId: 'input', units: 1n }], [{ ...prices[0]!, microUsdPerMillionUnits: -1n }], now));
});
test('unknown/stale/negative/duplicate/unbounded plans fail closed', () => {
  for (const plan of [[], [{ priceId: 'unknown', units: 1n }], [{ priceId: 'input', units: -1n }], [{ priceId: 'input', units: 100000000n }], [{ priceId: 'input', units: 1n }, { priceId: 'input', units: 1n }]]) assert.throws(() => estimate(plan, prices, now));
  assert.throws(() => estimate([{ priceId: 'input', units: 1n }], prices, new Date('2026-10-02T00:00:00Z')));
});
