import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parse } from 'pgsql-parser';

test('all product migrations parse with PostgreSQL parser (no database execution)', async () => {
  const files = (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort();
  assert.deepEqual(files, ['0001_product.sql', '0002_budget.sql', '0003_idempotency.sql', '0004_pipeline.sql']);
  for (const file of files) {
    const ast = await parse(await readFile(`migrations/${file}`, 'utf8'));
    assert.ok(ast, file);
  }
});
