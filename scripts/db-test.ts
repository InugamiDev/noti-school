import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from './migrate.js';
import { guardedDatabase } from './database.js';
import { databaseTarget } from '../packages/contracts/src/env.js';

// Explicit opt-in ONLY to an operator-provisioned empty disposable database.
if (process.env.NOTI_TEST_ACK !== 'disposable-noti-school') throw new Error('Disposable database not authorized; set NOTI_TEST_ACK and test URLs');
const migrationUrl = process.env.NOTI_TEST_MIGRATION_URL;
const apiUrl = process.env.NOTI_TEST_API_URL;
if (!migrationUrl || !apiUrl) throw new Error('Missing disposable database URLs');
const target = databaseTarget(migrationUrl, 'migrator', true);
const apiTarget = databaseTarget(apiUrl, 'api', true);
assert.equal(apiTarget.database, target.database);
assert.equal(apiTarget.host, target.host);
assert.equal(apiTarget.port, target.port);
const guard = await guardedDatabase(migrationUrl, 'migrator', true);
const pool = new pg.Pool({ connectionString: apiUrl, max: 20, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
try {
  const identity = await pool.query('SELECT current_database() db, current_user role');
  assert.equal(identity.rows[0].db, target.database); assert.equal(identity.rows[0].role, 'noti_school_api');
  await migrate(migrationUrl, true);
  const count = await guard.query('SELECT count(*)::int n FROM product.ai_reservations');
  assert.equal(count.rows[0].n, 0, 'Test requires an unused disposable DB; no reset is performed');
  await guard.query(`INSERT INTO product.ai_prices(id,provider,model,component,micro_usd_per_million_units,effective_at,valid_until,source_url) VALUES('synthetic-only','openai','fixture','input_tokens',1000000,now()-interval '1 day',now()+interval '1 day','https://example.invalid/synthetic')`);
  await guard.query(`INSERT INTO product.ai_prices(id,provider,model,component,micro_usd_per_million_units,effective_at,valid_until,source_url) VALUES('synthetic-free','jev','fixture','jev_output_tokens',0,now()-interval '1 day',now()+interval '1 day','https://example.invalid/synthetic')`);
  const plan = (units: number) => JSON.stringify([{ price_id: 'synthetic-only', units }, { price_id: 'synthetic-free', units: 100 }]);
  const reservations = Array.from({ length: 20 }, () => ({ id: randomUUID(), operation: randomUUID() }));
  const results = await Promise.allSettled(reservations.map(r => pool.query('SELECT product.reserve_ai($1,$2,1,$3::jsonb)', [r.id, r.operation, plan(5000000)])));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 10);
  const winner = reservations[results.findIndex(r => r.status === 'fulfilled')]!;
  await pool.query('SELECT product.mark_ai($1,$2)', [winner.id, 'dispatched']);
  await pool.query('SELECT product.mark_ai($1,$2)', [winner.id, 'uncertain']);
  await assert.rejects(pool.query('SELECT product.mark_ai($1,$2)', [winner.id, 'released']));
  await assert.rejects(pool.query('SELECT product.settle_ai($1,NULL)', [winner.id]));
  await assert.rejects(pool.query('DELETE FROM product.ai_reservations'));
  await assert.rejects(pool.query('SELECT * FROM auth.session'));
  const balance = await pool.query('SELECT sum(reserved_micro_usd)::text reserved FROM product.ai_months');
  assert.equal(balance.rows[0].reserved, '50000000');
  await assert.rejects(pool.query('SELECT product.settle_ai($1,$2::jsonb)', [winner.id, JSON.stringify([{ price_id: 'synthetic-only', units: 1000000 }])]));
  await pool.query('SELECT product.settle_ai($1,$2::jsonb)', [winner.id, plan(1000000)]);
  await assert.rejects(pool.query('SELECT product.settle_ai($1,$2::jsonb)', [winner.id, plan(1000000)]));
  console.log('Disposable DB checks passed: concurrent cap, uncertain retention, single settlement and runtime privileges. No providers called.');
} finally { await pool.end(); await guard.end(); }
