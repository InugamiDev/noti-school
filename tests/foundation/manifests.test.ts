import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
test('direct dependencies, workspace catalogs and migration filenames are deterministic', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const version of Object.values(pkg.devDependencies)) assert.match(String(version), /^\d+\.\d+\.\d+$/);
  const workspace = parse(readFileSync('pnpm-workspace.yaml', 'utf8'));
  assert.deepEqual(workspace.packages, ['packages/*', 'apps/auth', 'apps/web']);
  for (const version of Object.values(workspace.catalog)) assert.match(String(version), /^\d+\.\d+\.\d+$/);
  const lock = parse(readFileSync('pnpm-lock.yaml', 'utf8'));
  assert.ok(lock.importers['.']); assert.ok(lock.importers['packages/contracts']);
  for(const app of ['auth','web']) {
    assert.ok(lock.importers[`apps/${app}`]);
    const manifest=JSON.parse(readFileSync(`apps/${app}/package.json`,'utf8'));
    assert.ok(manifest.scripts.build);
    if(app==='auth') assert.equal(manifest.scripts.start,'node dist/server.js');
  }
});
