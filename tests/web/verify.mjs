import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url).pathname;
const artifacts = new URL('./artifacts/', import.meta.url).pathname;
await mkdir(artifacts, { recursive: true });
const env = { ...process.env, PATH: '/home/inu/.npm-global/bin:/home/inu/.nvm/versions/node/v24.18.0/bin:' + process.env.PATH };
const commands = [
  ['typecheck', ['--filter', '@noti/web', 'typecheck']],
  ['build', ['--filter', '@noti/web', 'build']],
  ['unit', ['--filter', '@noti/web', 'test']],
  ['browser', ['--filter', '@noti/web', 'test:e2e']],
];
const results = [];
for (const [name, args] of commands) {
  const started = new Date().toISOString();
  const run = spawnSync('pnpm', args, { cwd: root, env, encoding: 'utf8', timeout: 240000 });
  const output = (run.stdout || '') + (run.stderr || '');
  await writeFile(artifacts + name + '.txt', output);
  results.push({ command: 'pnpm ' + args.join(' '), cwd: root, started, ended: new Date().toISOString(), exit: run.status, signal: run.signal, artifact: `tests/web/artifacts/${name}.txt` });
  console.log(`${name}: exit ${run.status}`);
  if (run.status !== 0) console.log(output);
  await writeFile(artifacts + 'commands.json', JSON.stringify(results, null, 2) + '\n');
  if (run.status !== 0) process.exit(run.status || 1);
}
