import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSafeStorage } from '../src/ui/lib/storage.ts';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

class BrokenStorage extends MemoryStorage {
  override getItem(): string | null {
    throw new DOMException('denied', 'SecurityError');
  }
  override setItem(): void {
    throw new DOMException('full', 'QuotaExceededError');
  }
  override removeItem(): void {
    throw new DOMException('denied', 'SecurityError');
  }
}

test('safe storage round-trips with the noti. prefix', () => {
  const backing = new MemoryStorage();
  const store = createSafeStorage(() => backing);
  assert.equal(store.get('draft'), null);
  assert.equal(store.set('draft', 'Khi nào hạn rút môn học?'), true);
  assert.equal(backing.getItem('noti.draft'), 'Khi nào hạn rút môn học?');
  assert.equal(store.get('draft'), 'Khi nào hạn rút môn học?');
  assert.equal(store.remove('draft'), true);
  assert.equal(store.get('draft'), null);
});

test('safe storage tolerates a missing storage object', () => {
  const store = createSafeStorage(() => undefined);
  assert.equal(store.get('lang'), null);
  assert.equal(store.set('lang', 'vi'), false);
  assert.equal(store.remove('lang'), false);
});

test('safe storage tolerates a resolver that throws (blocked storage access)', () => {
  const store = createSafeStorage(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  assert.equal(store.get('scope'), null);
  assert.equal(store.set('scope', 'request'), false);
  assert.equal(store.remove('scope'), false);
});

test('safe storage tolerates storage methods that throw (quota, private mode)', () => {
  const store = createSafeStorage(() => new BrokenStorage());
  assert.equal(store.get('draft'), null);
  assert.equal(store.set('draft', 'x'), false);
  assert.equal(store.remove('draft'), false);
});

test('a custom prefix isolates keys', () => {
  const backing = new MemoryStorage();
  createSafeStorage(() => backing, 'other.').set('k', 'v');
  assert.equal(createSafeStorage(() => backing).get('k'), null);
  assert.equal(backing.getItem('other.k'), 'v');
});
