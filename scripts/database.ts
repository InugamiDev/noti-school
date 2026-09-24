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
