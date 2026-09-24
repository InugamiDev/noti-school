import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const command = process.argv[2];
const required = ['apps/api/Cargo.toml', 'apps/auth/package.json', 'apps/web/package.json'];
const missing = required.filter(p => !existsSync(p));
if (missing.length) { console.error(`Application prerequisites missing: ${missing.join(', ')}. Foundation checks: pnpm check. No application build claimed.`); process.exit(2); }
if (command === 'prerequisites') { console.log('Application manifests exist; install frozen dependencies and configure dedicated databases before migration.'); }
else if (command === 'build') {
  for (const [bin, args] of [['pnpm', ['--dir', 'apps/web', 'build']], ['pnpm', ['--dir', 'apps/auth', 'build']], ['cargo', ['build', '--locked', '--release', '--manifest-path', 'apps/api/Cargo.toml']]]) {
    const result = spawnSync(bin, args, { stdio: 'inherit' });
    if (result.error || result.status !== 0) process.exit(result.status || 1);
  }
} else { console.error('Usage: node scripts/apps.mjs prerequisites|build'); process.exit(2); }
