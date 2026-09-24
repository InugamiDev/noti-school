import pg from 'pg';
import { databaseTarget } from '../packages/contracts/src/env.js';

export async function guardedDatabase(raw: string | undefined, role: 'migrator' | 'auth_migrator', testOnly = false) {
  if (!raw) throw new Error('Missing dedicated migration URL');
  const expected = databaseTarget(raw, role, testOnly);
  const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 3000, statement_timeout: 30000 });
  await client.connect();
  try {
    const result = await client.query<{ database: string; role: string; project: string; purpose: string; privileged: boolean }>(`SELECT current_database() AS database, current_user AS role, i.project, i.purpose, (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole) AS privileged FROM noti_meta.identity i JOIN pg_roles r ON r.rolname = current_user WHERE i.singleton = true`);
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row || row.database !== expected.database || row.role !== expected.role || row.project !== 'noti.school' || row.privileged || row.purpose !== (expected.database.startsWith('noti_school_test_') ? 'test' : 'production')) throw new Error('Dedicated database marker or identity mismatch');
    return client;
  } catch { await client.end(); throw new Error('Database guard failed; no migrations executed'); }
}

// Runtime roles intentionally cannot read the provisioning marker. Check it with a separate
// read-only guard connection, then prove the runtime connection targets the same database.
export async function guardedRuntimeDatabase(raw: string | undefined, guardRaw: string | undefined, role: 'api' | 'auth', testOnly = false) {
  if (!raw || !guardRaw) throw new Error('Runtime and dedicated guard URLs required');
  const target = databaseTarget(raw, role, testOnly);
  const guardRole = role === 'api' ? 'migrator' : 'auth_migrator';
  const expected = databaseTarget(guardRaw, guardRole, testOnly);
  if (target.database !== expected.database || target.host !== expected.host || target.port !== expected.port) throw new Error('Runtime and guard targets differ');
  const guard = await guardedDatabase(guardRaw, guardRole, testOnly);
  await guard.end();
  const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
  await client.connect();
  try {
    const result = await client.query('SELECT current_database() AS database,current_user AS role,(rolsuper OR rolcreatedb OR rolcreaterole) AS privileged FROM pg_roles WHERE rolname=current_user');
    const actual = result.rows[0];
    if (!actual || actual.database !== target.database || actual.role !== target.role || actual.privileged) throw new Error('Runtime identity mismatch');
    return client;
  } catch (error) { await client.end(); throw error; }
}
