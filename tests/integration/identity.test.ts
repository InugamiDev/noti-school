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
import { preserveFixtures } from './preserve-fixtures.js';

const url = (role: string) => `postgresql://noti_school_${role}:synthetic-test-only@127.0.0.1:54390/noti_school_test_identity2`;
function guard() { assert.equal(process.env.NOTI_TEST_ACK, 'disposable-noti-school', 'Explicit dedicated test acknowledgement required'); }

test('combined pipeline schema retains stage-linked roots without blocking ordinary retention', async () => {
  guard();
  const target = (role: string) => url(role).replace('noti_school_test_identity2', 'noti_school_test_retention');
  const runtime = await guardedRuntimeDatabase(target('api'), target('migrator'), 'api', true);
  const release = await preserveFixtures(target, 'api');
  const institution = randomUUID(), operation = randomUUID(), stage = randomUUID(), plain = randomUUID();
  try {
    const money = (await runtime.query('SELECT * FROM product.ai_reservations ORDER BY id')).rows;
    await runtime.query("INSERT INTO product.institutions(id,slug,name,coverage) VALUES($1,$2,'Synthetic retention','none')", [institution, `retention-${institution}`]);
    for (const root of [operation, plain]) await runtime.query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state,response,expires_at) VALUES($1,'synthetic-retention',$2,$3,$2,'completed','{}','2000-01-01')", [institution, root, 'b'.repeat(64)]);
    await runtime.query("INSERT INTO product.pipeline_stages(id,root_operation_id,stage,input_sha256) VALUES($1,$2,'synthetic-stage',$3)", [stage, operation, 'c'.repeat(64)]);
    await retainPersonalData(runtime, { limit: 100 });
    assert.equal((await runtime.query('SELECT operation_id FROM product.idempotency_keys WHERE operation_id=$1', [operation])).rowCount, 1);
    assert.equal((await runtime.query('SELECT operation_id FROM product.idempotency_keys WHERE operation_id=$1', [plain])).rowCount, 0);
    assert.equal((await runtime.query('SELECT id FROM product.pipeline_stages WHERE id=$1', [stage])).rowCount, 1);
    assert.deepEqual((await runtime.query('SELECT * FROM product.ai_reservations ORDER BY id')).rows, money);
  } finally { await release(); await runtime.end(); }
});

test('PostgreSQL runtime Better Auth: capabilities, verification/reset races, revocation and confirmed deletion fail closed', async () => {
  guard();
  const checked = await guardedRuntimeDatabase(url('auth'), url('auth_migrator'), 'auth', true); await checked.end();
  const pool = new pg.Pool({ connectionString: url('auth'), options: '-c search_path=auth', max: 5 });
  const release = await preserveFixtures(url, 'auth');
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
    await release();
  }
});

test('dedicated runtime operator bootstrap, exclusive private output, immutable prices and bounded retention preserve uncertain budget', async () => {
  guard();
  const runtime = await guardedRuntimeDatabase(url('api'), url('migrator'), 'api', true);
  const migrator = await guardedDatabase(url('migrator'), 'migrator', true);
  const release = await preserveFixtures(url, 'api'), releaseAuth = await preserveFixtures(url, 'auth');
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
    const reservation = randomUUID(), operation = randomUUID();
    await migrator.query("INSERT INTO product.ai_reservations(id,month,operation_id,attempt,plan,reserved_micro_usd,state,created_at) VALUES($1,$2,$3,1,$4,1,'uncertain','2000-01-01')", [reservation, month, operation, JSON.stringify([{ price_id: price.id, units: 1 }])]);
    const before = (await runtime.query('SELECT * FROM product.ai_reservations WHERE id=$1', [reservation])).rows[0];
    const fence = randomUUID();
    await runtime.query("INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state,response,expires_at) VALUES($1,'synthetic-retention',$2,$3,$4,'completed',$5,'2000-01-01')", [value.institution_id, fence, 'a'.repeat(64), operation, JSON.stringify({ synthetic: true })]);
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
    await runtime.query('DELETE FROM product.conversations WHERE id=ANY($1::uuid[])', [[...conversationIds, current]]);
    await runtime.query('DELETE FROM product.invitations WHERE id=ANY($1::uuid[])', [[value.invitation_id, student.invitation_id, cliMaterial.invitation_id]]);
    await retainPersonalData(runtime, { limit: 100 });
    const retentionInput = `${directory}/retention.json`;
    await writeFile(retentionInput, JSON.stringify({ days: 30, limit: 1 }), { mode: 0o600 });
    await operator(['retention', retentionInput], { NOTI_OPERATOR_ACK: 'dedicated-noti-school', NOTI_TEST_ACK: 'disposable-noti-school', DATABASE_URL: url('api'), NOTI_MIGRATION_URL: url('migrator'), AUTH_DATABASE_URL: url('auth'), NOTI_AUTH_MIGRATION_URL: url('auth_migrator') });
    assert.deepEqual((await runtime.query('SELECT * FROM product.ai_reservations WHERE id=$1', [reservation])).rows[0], before);
  } finally { await releaseAuth(); await release(); await runtime.end(); await migrator.end(); await rm(directory, { recursive: true, force: true }); }
});

test('runtime retention preserves unfinished jobs and pseudonymizes only old terminal settled operations in bounded idempotent batches', async () => {
  guard();
  const target = (role: string) => url(role).replace('noti_school_test_identity2', 'noti_school_test_retention');
  const runtime = await guardedRuntimeDatabase(target('api'), target('migrator'), 'api', true);
  const migrator = await guardedDatabase(target('migrator'), 'migrator', true);
  const release = await preserveFixtures(target, 'api');
  const institution = randomUUID(), source = randomUUID();
  const ids: Record<string, string> = Object.fromEntries(['settled', 'settledRoot', 'terminalFailed', 'young', 'renewed', 'uncertain', 'dispatched', 'reserved', 'pending', 'disabled', 'failed', 'queued', 'running', 'succeeded'].map(name => [name, randomUUID()]));
  const stages: Record<string, string> = {};
  const moneyBefore = (await runtime.query('SELECT * FROM product.ai_reservations ORDER BY id')).rows;
  try {
    await runtime.query("INSERT INTO product.institutions(id,slug,name,coverage) VALUES($1,$2,'Synthetic repair retention','none')", [institution, `repair-${institution}`]);
    await runtime.query("INSERT INTO product.sources(id,institution_id,title,kind,visibility) VALUES($1,$2,'Synthetic retention','text','admin')", [source, institution]);
    for (const [name, operation] of Object.entries(ids)) {
      await runtime.query(`INSERT INTO product.idempotency_keys(institution_id,user_id,key,request_sha256,operation_id,state,response,created_at,expires_at)
        VALUES($1,$2,$3,$4,$3,$5,$6,$7,$8)`, [institution, `synthetic-person-${operation}`, operation, 'a'.repeat(64), name === 'pending' ? 'pending' : name === 'terminalFailed' ? 'failed' : 'completed',
        JSON.stringify({ personal: 'Synthetic private response' }), name === 'young' ? new Date() : new Date('1999-01-01'), ['young', 'renewed'].includes(name) ? new Date() : new Date(name === 'settled' ? '1999-01-02' : '2000-01-01')]);
      if (['disabled', 'failed', 'queued', 'running', 'succeeded'].includes(name)) {
        const version = randomUUID();
        await runtime.query(`INSERT INTO product.source_versions(id,institution_id,source_id,label,sha256,storage_key,status,indexing)
          VALUES($1,$2,$3,'Synthetic',$4,$5,'pending_review',$6)`, [version, institution, source, createHash('sha256').update(version).digest('hex'), `synthetic/${version}`, name === 'succeeded' ? 'ready' : name === 'queued' ? 'pending' : name]);
        await runtime.query('INSERT INTO product.ingestion_jobs(id,institution_id,version_id,state) VALUES($1,$2,$3,$4)', [operation, institution, version, name]);
      }
      // Disabled/queued/running roots deliberately have no paid stage yet.
      if (!['disabled', 'queued', 'running', 'reserved', 'settledRoot'].includes(name)) {
        stages[name] = randomUUID();
        await runtime.query(`INSERT INTO product.pipeline_stages(id,root_operation_id,stage,input_sha256,result)
          VALUES($1,$2,'synthetic-stage',$3,$4)`, [stages[name], operation, 'b'.repeat(64), JSON.stringify({ personal: 'Synthetic cached text' })]);
      }
    }
    const secondStage = randomUUID();
    await runtime.query("INSERT INTO product.pipeline_stages(id,root_operation_id,stage,input_sha256,result) VALUES($1,$2,'second-synthetic-stage',$3,$4)", [secondStage, ids.settled, 'c'.repeat(64), JSON.stringify({ personal: 'Second cached text' })]);
    const month = (await migrator.query<{ month: string }>("SELECT year::text||'-01-01' AS month FROM generate_series(1500,1899) year WHERE NOT EXISTS(SELECT 1 FROM product.ai_months WHERE month=make_date(year,1,1)) ORDER BY year LIMIT 1")).rows[0]!.month;
    // A fresh accounting month avoids modifying pre-existing aggregate money.
    assert.equal((await migrator.query('INSERT INTO product.ai_months(month,reserved_micro_usd,spent_micro_usd) VALUES($1,3,2) ON CONFLICT DO NOTHING RETURNING month', [month])).rowCount, 1);
    const price = `retention-${randomUUID()}`;
    await importPrices(migrator, [{ id: price, provider: 'openai', model: 'synthetic-only', component: 'input_tokens', units: 'micro_usd_per_million_units', micro_usd_per_million_units: 1,
      effective_at: '2000-01-01T00:00:00Z', valid_until: '2000-01-02T00:00:00Z', source_url: 'https://example.invalid/synthetic-price' }]);
    for (const state of ['settled', 'uncertain', 'dispatched', 'reserved']) {
      await migrator.query(`INSERT INTO product.ai_reservations(id,month,operation_id,attempt,plan,reserved_micro_usd,actual_micro_usd,state)
        VALUES($1,$2,$3,1,$4,1,$5,$6)`, [randomUUID(), month, state === 'dispatched' || state === 'settled' ? stages[state] : ids[state], JSON.stringify([{ price_id: price, units: 1 }]), state === 'settled' ? 1 : null, state]);
    }
    await migrator.query(`INSERT INTO product.ai_reservations(id,month,operation_id,attempt,plan,reserved_micro_usd,actual_micro_usd,state)
      VALUES($1,$2,$3,1,$4,1,1,'settled')`, [randomUUID(), month, ids.settledRoot, JSON.stringify([{ price_id: price, units: 1 }])]);
    const money = (await runtime.query('SELECT * FROM product.ai_reservations ORDER BY id')).rows;
    const budgets = (await runtime.query('SELECT * FROM product.ai_months ORDER BY month')).rows;
    const exempt = ['young', 'renewed', 'uncertain', 'dispatched', 'reserved', 'pending', 'disabled', 'failed', 'queued', 'running'].map(name => ids[name]);
    const original = (await runtime.query('SELECT * FROM product.idempotency_keys WHERE operation_id=ANY($1::uuid[]) ORDER BY operation_id', [exempt])).rows;
    const originalStages = (await runtime.query('SELECT * FROM product.pipeline_stages WHERE root_operation_id=ANY($1::uuid[]) ORDER BY id', [exempt])).rows;
    const rowLock = await guardedRuntimeDatabase(target('api'), target('migrator'), 'api', true);
    try {
      await rowLock.query('BEGIN'); await rowLock.query('SELECT operation_id FROM product.idempotency_keys WHERE operation_id=$1 FOR UPDATE', [ids.settled]);
      const result = await retainPersonalData(runtime, { limit: 1 });
      assert.ok(result.pseudonymized! <= 1 && result.stages! <= 1);
      assert.equal((await runtime.query('SELECT user_id FROM product.idempotency_keys WHERE operation_id=$1', [ids.settled])).rows[0]!.user_id, `synthetic-person-${ids.settled}`);
    } finally { await rowLock.query('ROLLBACK'); await rowLock.end(); }
    for (let run = 0; run < 6; run++) {
      const result = await retainPersonalData(runtime, { limit: 1 });
      assert.ok(result.pseudonymized! <= 1 && result.stages! <= 1 && result.idempotency! <= 1);
    }
    for (const name of ['settled', 'settledRoot', 'terminalFailed', 'succeeded']) {
      const row = (await runtime.query('SELECT * FROM product.idempotency_keys WHERE operation_id=$1', [ids[name]])).rows[0]!;
      assert.equal(row.user_id, `retained:${ids[name]}`); assert.equal(row.request_sha256, '0'.repeat(64)); assert.deepEqual(row.response, {});
      assert.equal(row.key, ids[name]); assert.equal(row.state, name === 'terminalFailed' ? 'failed' : 'completed');
      const stageRows = (await runtime.query('SELECT * FROM product.pipeline_stages WHERE root_operation_id=$1', [ids[name]])).rows;
      assert.ok(stageRows.every(row => row.result === null && row.input_sha256 === '0'.repeat(64)));
    }
    for (let repeat = 0; repeat < 2; repeat++) {
      const result = await retainPersonalData(runtime, { limit: 1 });
      assert.equal(result.pseudonymized, 0); assert.equal(result.stages, 0);
    }
    assert.deepEqual((await runtime.query('SELECT * FROM product.idempotency_keys WHERE operation_id=ANY($1::uuid[]) ORDER BY operation_id', [exempt])).rows, original);
    assert.deepEqual((await runtime.query('SELECT * FROM product.pipeline_stages WHERE root_operation_id=ANY($1::uuid[]) ORDER BY id', [exempt])).rows, originalStages);
    assert.deepEqual((await runtime.query('SELECT * FROM product.ai_reservations ORDER BY id')).rows, money);
    assert.deepEqual((await runtime.query('SELECT * FROM product.ai_months ORDER BY month')).rows, budgets);
    assert.deepEqual(money.filter(row => moneyBefore.some(old => old.id === row.id)), moneyBefore);
    const blocker = await guardedRuntimeDatabase(target('api'), target('migrator'), 'api', true);
    try {
      await blocker.query('BEGIN'); await blocker.query('SELECT pg_advisory_xact_lock(718443901)');
      const start = Date.now();
      await assert.rejects(retainPersonalData(runtime, { limit: 1 }), (error: unknown) => (error as { code: string }).code === '55P03');
      assert.ok(Date.now() - start < 4500, 'Two-second lock timeout bounds blocked operator work');
    } finally { await blocker.query('ROLLBACK'); await blocker.end(); }
    assert.deepEqual((await runtime.query('SELECT * FROM product.ai_reservations ORDER BY id')).rows, money);
  } finally { await release(); await runtime.end(); await migrator.end(); }
});
