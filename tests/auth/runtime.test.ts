import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createConnection } from 'node:net';

test('compiled production entry boots without secrets on loopback, fails closed, and stops on SIGTERM', async () => {
  const occupied = await new Promise<boolean>(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port: 3811 });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
  assert.equal(occupied, false, 'Port 3811 occupied; refusing to interfere with another listener');
  const child = spawn(process.execPath, [new URL('../../apps/auth/dist/server.js', import.meta.url).pathname], {
    env: { NODE_ENV: 'production', APP_ORIGIN: 'https://noti.school' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += String(chunk); });
  child.stderr.on('data', chunk => { output += String(chunk); });
  const exit = once(child, 'exit');
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      exit.then(() => { throw new Error('Compiled server exited before startup'); }),
      new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error('Startup timed out')), 5000); timer.unref(); }),
    ]);
    assert.match(output, /loopback/);
    const health = await fetch('http://127.0.0.1:3811/healthz'); assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', contract_version: '1' });
    assert.equal((await fetch('http://127.0.0.1:3811/readyz')).status, 503);
    assert.equal((await fetch('http://127.0.0.1:3811/api/auth/get-session')).status, 503);
    assert.equal((await fetch('http://127.0.0.1:3811/internal/session', { method: 'POST' })).status, 401);
    assert.equal((await fetch('http://127.0.0.1:3811/api/auth/sign-in/email', { method: 'POST', headers: { origin: 'https://evil.invalid' } })).status, 403);
    child.kill('SIGTERM');
    const [code, signal] = await exit;
    assert.equal(code, 0, output); assert.equal(signal, null);
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exit; } }
});
