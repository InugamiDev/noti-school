import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash, createHmac } from 'node:crypto';
import { mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import pg from 'pg';
import { guardedDatabase, guardedRuntimeDatabase } from '../../scripts/database.js';
import { bootstrap, importPrices, retainPersonalData, retainIdentityData, operator, Price } from '../../scripts/operator.js';
import { createIdentity } from '../../apps/auth/src/auth.js';
import { readConfig } from '../../apps/auth/src/config.js';
import { Invitations } from '../../apps/auth/src/invitations.js';
import { Accounts } from '../../apps/auth/src/accounts.js';
import { createService } from '../../apps/auth/src/service.js';
import type { IdentityMail, Mailer } from '../../apps/auth/src/mail.js';
import { cookies, secret, origin } from '../auth/helpers.js';

const url = (role: string) => `postgresql://noti_school_${role}:synthetic-test-only@127.0.0.1:54390/noti_school_test_identity2`;
function guard() { assert.equal(process.env.NOTI_TEST_ACK, 'disposable-noti-school', 'Explicit dedicated test acknowledgement required'); }

test('combined pipeline schema retains stage-linked roots without blocking ordinary retention', async () => {
  guard();
  const target = (role: string) => url(role).replace('noti_school_test_identity2', 'noti_school_test_retention');
  const runtime = await guardedRuntimeDatabase(target('api'), target('migrator'), 'api', true);
  const institution = randomUUID(), operation = randomUUID(), stage = randomUUID(), plain = randomUUID();
  try {
    assert.equal((await runtime.query("SELECT id FROM product.ai_reservations WHERE state IN ('reserved','dispatched','uncertain')")).rowCount, 0, 'Fresh retention fixture must exercise the delete branch');
    await runtime.query("INSERT INTO product.institutions(id,slug,name,coverage) VALUES($1,$2,'Synthetic retention','none')", [institution, `retention-${institution}`]);
    for (const root of [operation, plain]) await runtime.query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state,response,expires_at) VALUES($1,'synthetic-retention',$2,$3,$2,'completed','{}','2000-01-01')", [institution, root, 'b'.repeat(64)]);
    await runtime.query("INSERT INTO product.pipeline_stages(id,root_operation_id,stage,input_sha256) VALUES($1,$2,'synthetic-stage',$3)", [stage, operation, 'c'.repeat(64)]);
    await retainPersonalData(runtime, { limit: 100 });
    assert.equal((await runtime.query('SELECT operation_id FROM product.idempotency_keys WHERE operation_id=$1', [operation])).rowCount, 1);
    assert.equal((await runtime.query('SELECT operation_id FROM product.idempotency_keys WHERE operation_id=$1', [plain])).rowCount, 0);
    assert.equal((await runtime.query('SELECT id FROM product.pipeline_stages WHERE id=$1', [stage])).rowCount, 1);
  } finally { await runtime.end(); }
});

test('PostgreSQL runtime Better Auth: capabilities, verification/reset races, revocation and confirmed deletion fail closed', async () => {
  guard();
  const checked = await guardedRuntimeDatabase(url('auth'), url('auth_migrator'), 'auth', true); await checked.end();
  const pool = new pg.Pool({ connectionString: url('auth'), options: '-c search_path=auth', max: 5 });
  const sent: IdentityMail[] = []; let failMail = false, failed = false, failCleanup = false;
  const cleanup: unknown[] = [];
  const mail: Mailer = { enabled: true, get failed() { return failed; }, close() {}, async send(value) {
    if (failMail) { failed = true; throw new Error('Synthetic mail failure'); } sent.push(value);
  } };
  const invitation = new Invitations(secret, async () => Response.json({ valid: true }));
  const accounts = new Accounts(secret, async (input, init) => {
    assert.equal(String(input), 'http://127.0.0.1:3810/internal/accounts/delete');
    assert.equal(new Headers(init?.headers).get('host'), '127.0.0.1:3810');
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${secret}`);
    assert.equal(init?.redirect, 'error');
    cleanup.push(JSON.parse(String(init?.body)));
    return Response.json(failCleanup ? {} : { deleted: true }, { status: failCleanup ? 503 : 200 });
  });
  const cfg = readConfig({ NODE_ENV: 'test', AUTH_DATABASE_URL: url('auth'), BETTER_AUTH_SECRET: secret, INTERNAL_AUTH_SECRET: secret });
  const auth = createIdentity(cfg, pool, mail, invitation, accounts);
  let ready = true;
  const service = createService({ config: cfg, auth, mail, invitations: invitation, ready: async () => { await pool.query('SELECT 1'); return ready; }, pause: async () => {} });
  let cookie = '';
  const request = (path: string, body?: unknown) => service(new Request(`${origin}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { origin, 'content-type': 'application/json', cookie, 'x-noti-peer-ip': '192.0.2.190', 'x-noti-invitation': 'synthetic-only' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  const internal = (path: string, extra: Record<string, string> = {}, body?: string) => service(new Request(`http://127.0.0.1:3811/internal/${path}`, { method: 'POST', headers: { host: '127.0.0.1:3811', authorization: `Bearer ${secret}`, cookie, ...extra }, ...(body === undefined ? {} : { body }) }));
  const email = `synthetic-${randomUUID()}@example.invalid`;
  const signup = { email, name: 'Synthetic PostgreSQL identity', password: 'Synthetic-original-password-123' };
  let userId = '';
  try {
    assert.equal((await internal('capabilities', { host: 'localhost:3811' })).status, 404);
    assert.equal((await internal('capabilities', { authorization: 'Bearer invalid' })).status, 401);
    assert.equal((await internal('capabilities', {}, '{}')).status, 400);
    assert.deepEqual((await (await internal('capabilities')).json()).email, { state: 'available', reason: 'ready' });
    ready = false; assert.equal((await (await internal('capabilities')).json()).identity.reason, 'core_failed'); ready = true;
    assert.equal((await request('/sign-up/email', signup)).status, 200);
    userId = (await pool.query<{ id: string }>('SELECT id FROM auth."user" WHERE email=$1', [email])).rows[0]!.id;
    const verify = () => service(new Request(sent[0]!.url));
    assert.deepEqual((await Promise.all([verify(), verify()])).map(r => r.status).sort(), [302, 401]);
    const login = await request('/sign-in/email', signup); assert.equal(login.status, 200); cookie = cookies(login);
    assert.equal((await internal('session')).status, 200);
    await request('/request-password-reset', { email, redirectTo: `${origin}/#/auth` });
    const reset = new URLSearchParams(new URL(sent.at(-1)!.url).hash.split('?')[1]).get('token')!;
    const resets = await Promise.all([1, 2].map(() => request('/reset-password', { token: reset, newPassword: 'Synthetic-replacement-password-456' })));
    assert.deepEqual(resets.map(r => r.status).sort(), [200, 400]);
    assert.equal((await internal('session')).status, 401);
    cookie = cookies(await request('/sign-in/email', { email, password: 'Synthetic-replacement-password-456' }));
    assert.equal((await internal('session')).status, 200);
    await pool.query('UPDATE auth.session SET "expiresAt"=$1 WHERE "userId"=$2', [new Date(0), userId]);
    assert.equal((await internal('session')).status, 401);
    cookie = cookies(await request('/sign-in/email', { email, password: 'Synthetic-replacement-password-456' }));
    assert.equal((await request('/delete-user', {})).status, 200);
    assert.equal(cleanup.length, 0, 'Initiation must not delete');
    let token = new URLSearchParams(new URL(sent.at(-1)!.url).hash.split('?')[1]).get('delete_token')!;
    failCleanup = true;
    assert.equal((await request('/delete-user', { token })).status, 503);
    assert.equal((await pool.query('SELECT id FROM auth."user" WHERE id=$1', [userId])).rowCount, 1);
    assert.equal((await request('/delete-user', { token })).status, 404, 'Failed cleanup consumes token; new confirmation is required');
    failCleanup = false;
    await request('/delete-user', {});
    token = new URLSearchParams(new URL(sent.at(-1)!.url).hash.split('?')[1]).get('delete_token')!;
    await pool.query('UPDATE auth.verification SET "expiresAt"=$1 WHERE identifier=$2', [new Date(0), `delete-account-${token}`]);
    assert.equal((await request('/delete-user', { token })).status, 404);
    assert.equal(cleanup.length, 1, 'Expired deletion must not invoke cleanup');
    failMail = true;
    assert.equal((await request('/delete-user', {})).status, 503, 'Library mail catch must not produce success');
    assert.equal((await (await internal('capabilities')).json()).email.reason, 'provider_failed');
    assert.equal((await pool.query('SELECT id FROM auth."user" WHERE id=$1', [userId])).rowCount, 1);
    failMail = false; failed = false; // Simulate explicit service recovery after a synthetic transport repair.
    await request('/delete-user', {});
    token = new URLSearchParams(new URL(sent.at(-1)!.url).hash.split('?')[1]).get('delete_token')!;
    const outcomes = await Promise.all([1, 2].map(() => request('/delete-user', { token })));
    assert.equal(outcomes.filter(r => r.status === 200).length, 1);
    assert.ok(outcomes.some(r => r.status >= 400));
    assert.deepEqual(cleanup, [{ user_id: userId }, { user_id: userId }]);
    assert.equal((await pool.query('SELECT id FROM auth."user" WHERE id=$1', [userId])).rowCount, 0);
    assert.equal((await internal('session')).status, 401);
    assert.equal((await request('/internal/accounts/delete', { user_id: 'spoof' })).status, 404);
    const runtime = await guardedRuntimeDatabase(url('auth'), url('auth_migrator'), 'auth', true);
    try {
      const marker = randomUUID();
      await runtime.query('INSERT INTO auth.verification(id,identifier,value,"expiresAt","createdAt","updatedAt") VALUES($1,$2,$3,$4,now(),now())', [marker, 'synthetic-retention', 'synthetic-only', new Date(0)]);
      await retainIdentityData(runtime, { limit: 100 });
      assert.equal((await runtime.query('SELECT id FROM auth.verification WHERE id=$1', [marker])).rowCount, 0);
      await assert.rejects(runtime.query('SELECT * FROM product.memberships'));
    } finally { await runtime.end(); }
  } finally {
    if (userId) await pool.query('DELETE FROM auth."user" WHERE id=$1', [userId]);
    await pool.end();
  }
});

test('dedicated runtime operator bootstrap, exclusive private output, immutable prices and bounded retention preserve uncertain budget', async () => {
  guard();
  const runtime = await guardedRuntimeDatabase(url('api'), url('migrator'), 'api', true);
  const migrator = await guardedDatabase(url('migrator'), 'migrator', true);
  const directory = await mkdtemp(`${tmpdir()}/noti-identity2-`);
  try {
    await assert.rejects(operator(['bootstrap', '/unused'], {}));
    await assert.rejects(operator(['prices', '/unused'], { NOTI_OPERATOR_ACK: 'dedicated-noti-school' }));
    await assert.rejects(bootstrap(runtime, { email: 'synthetic@example.invalid', output: `${directory}/missing-role` }, secret));
    const output = `${directory}/invitation.json`;
    const value = await bootstrap(runtime, { email: 'Synthetic@example.invalid', role: 'admin', output }, secret);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    const material = JSON.parse(await readFile(output, 'utf8'));
    assert.equal('token' in value, false);
    const stored = (await runtime.query('SELECT * FROM product.invitations WHERE id=$1', [value.invitation_id])).rows[0]!;
    assert.equal(stored.token_hash, createHash('sha256').update(material.token).digest('hex'));
    assert.equal(stored.email_hash, createHmac('sha256', secret).update('synthetic@example.invalid').digest('hex'));
    assert.equal(stored.role, 'admin');
    assert.equal((await runtime.query('SELECT coverage FROM product.institutions WHERE id=$1', [value.institution_id])).rows[0]!.coverage, 'none');
    await assert.rejects(bootstrap(runtime, { email: 'synthetic@example.invalid', role: 'student', output }, secret));
    const student = await bootstrap(runtime, { email: 'student@example.invalid', role: 'student', output: `${directory}/student.json` }, secret);
    assert.equal((await runtime.query('SELECT role FROM product.invitations WHERE id=$1', [student.invitation_id])).rows[0]!.role, 'student');
    const cliInput = `${directory}/bootstrap-input.json`, cliOutput = `${directory}/cli-invitation.json`;
    await writeFile(cliInput, JSON.stringify({ email: 'cli-synthetic@example.invalid', role: 'student', output: cliOutput }), { mode: 0o600 });
    const cli = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/operator.ts', 'bootstrap', cliInput], {
      cwd: new URL('../../', import.meta.url), encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH, NOTI_OPERATOR_ACK: 'dedicated-noti-school', NOTI_TEST_ACK: 'disposable-noti-school', DATABASE_URL: url('api'), NOTI_MIGRATION_URL: url('migrator'), INTERNAL_AUTH_SECRET: secret },
    });
    assert.equal(cli.status, 0, cli.stderr);
    const cliMaterial = JSON.parse(await readFile(cliOutput, 'utf8'));
    assert.equal(cli.stdout.includes(cliMaterial.token), false);
    assert.equal(cli.stdout.includes(cliMaterial.email), false);
    assert.equal((await stat(cliOutput)).mode & 0o777, 0o600);
    const price = { id: `synthetic-${randomUUID()}`, provider: 'openai', model: 'synthetic-only', component: 'input_tokens', units: 'micro_usd_per_million_units', micro_usd_per_million_units: 1, effective_at: '2000-01-01T00:00:00Z', valid_until: '2000-01-02T00:00:00Z', source_url: 'https://example.invalid/synthetic-price' };
    assert.equal(Price.safeParse({ ...price, units: 'dollars' }).success, false);
    assert.equal(Price.safeParse({ ...price, valid_until: price.effective_at }).success, false);
    assert.equal(Price.safeParse({ ...price, provider: 'jev' }).success, false);
    assert.equal(Price.safeParse({ ...price, source_url: 'http://example.invalid' }).success, false);
    assert.deepEqual(await importPrices(migrator, [price]), { inserted: 1 });
    await assert.rejects(importPrices(migrator, [price]));
    await assert.rejects(runtime.query('UPDATE product.ai_prices SET model=$1 WHERE id=$2', ['modified', price.id]));
    await assert.rejects(migrator.query('UPDATE product.ai_prices SET model=$1 WHERE id=$2', ['modified', price.id]));
    const month = '2000-01-01';
    await migrator.query('INSERT INTO product.ai_months(month,reserved_micro_usd) VALUES($1,1) ON CONFLICT(month) DO NOTHING', [month]);
    const reservation = randomUUID();
    await migrator.query("INSERT INTO product.ai_reservations(id,month,operation_id,attempt,plan,reserved_micro_usd,state,created_at) VALUES($1,$2,$3,1,$4,1,'uncertain','2000-01-01')", [reservation, month, randomUUID(), JSON.stringify([{ price_id: price.id, units: 1 }])]);
    const before = (await runtime.query('SELECT * FROM product.ai_reservations WHERE id=$1', [reservation])).rows[0];
    const fence = randomUUID();
    await runtime.query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state,response,expires_at) VALUES($1,'synthetic-retention',$2,$3,$4,'completed',$5,'2000-01-01')", [value.institution_id, fence, 'a'.repeat(64), randomUUID(), JSON.stringify({ synthetic: true })]);
    const conversationIds = [randomUUID(), randomUUID()];
    for (const id of conversationIds) await runtime.query("INSERT INTO product.conversations(id,institution_id,user_id,created_at) VALUES($1,$2,'synthetic-retention','2000-01-01')", [id, value.institution_id]);
    const current = randomUUID();
    await runtime.query("INSERT INTO product.conversations(id,institution_id,user_id) VALUES($1,$2,'synthetic-current')", [current, value.institution_id]);
    const retained = await retainPersonalData(runtime, { days: 90, limit: 1 });
    assert.equal(retained.conversations, 1);
    assert.equal((await runtime.query('SELECT id FROM product.conversations WHERE id=ANY($1::uuid[])', [conversationIds])).rowCount, 1);
    assert.equal((await runtime.query('SELECT id FROM product.conversations WHERE id=$1', [current])).rowCount, 1);
    assert.deepEqual((await runtime.query('SELECT * FROM product.ai_reservations WHERE id=$1', [reservation])).rows[0], before);
    assert.equal((await runtime.query('SELECT key FROM product.idempotency_keys WHERE key=$1', [fence])).rowCount, 1, 'Uncertainty preserves replay fences even when expired');
    await runtime.query('DELETE FROM product.idempotency_keys WHERE key=$1', [fence]);
    await runtime.query('DELETE FROM product.conversations WHERE id=ANY($1::uuid[])', [[...conversationIds, current]]);
    await runtime.query('DELETE FROM product.invitations WHERE id=ANY($1::uuid[])', [[value.invitation_id, student.invitation_id, cliMaterial.invitation_id]]);
    await retainPersonalData(runtime, { limit: 100 });
    const retentionInput = `${directory}/retention.json`;
    await writeFile(retentionInput, JSON.stringify({ days: 30, limit: 1 }), { mode: 0o600 });
    await operator(['retention', retentionInput], { NOTI_OPERATOR_ACK: 'dedicated-noti-school', NOTI_TEST_ACK: 'disposable-noti-school', DATABASE_URL: url('api'), NOTI_MIGRATION_URL: url('migrator'), AUTH_DATABASE_URL: url('auth'), NOTI_AUTH_MIGRATION_URL: url('auth_migrator') });
    assert.deepEqual((await runtime.query('SELECT * FROM product.ai_reservations WHERE id=$1', [reservation])).rows[0], before);
  } finally { await runtime.end(); await migrator.end(); await rm(directory, { recursive: true, force: true }); }
});
