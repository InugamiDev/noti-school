import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';
const require = createRequire(import.meta.url);
const { apps } = require('../infra/ecosystem.config.cjs');
assert.deepEqual(apps.map(a => a.name), ['noti-school-api', 'noti-school-auth']);
for (const app of apps) { assert.equal(app.instances, 1); assert.equal(app.exec_mode, 'fork'); assert.equal(app.max_restarts, 5); assert.ok(app.script.startsWith('/home/inu/projects/noti-school/current/')); }
assert.equal(apps[0].interpreter, 'none');
assert.equal(apps[1].interpreter, 'node');
const config = 'infra/cloudflared.candidate.yml';
const ingress = parse(readFileSync(config, 'utf8')).ingress;
assert.equal(ingress.at(-1).service, 'http_status:404');
const run = args => {
  const result = spawnSync('cloudflared', ['tunnel', '--config', config, 'ingress', ...args], { encoding: 'utf8' });
  if (result.error) throw new Error('cloudflared is required for candidate validation');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout + result.stderr;
};
run(['validate']);
for (const [path, rule] of [['/api/auth', 0], ['/api/auth/get-session', 0], ['/api/auth/callback/google', 0], ['/api/authentic', 1], ['/internal/session', 1], ['/api/v1/me', 1], ['/', 1]]) {
  assert.match(run(['rule', `https://noti.school${path}`]), new RegExp(`Matched rule #${rule}`));
}
assert.match(run(['rule', 'https://unrelated.invalid/']), /Matched rule #2/);
console.log('PM2 declarations and candidate ingress syntax/8 rule matches passed; no services started. Internal paths route to Rust, which MUST return 404.');
