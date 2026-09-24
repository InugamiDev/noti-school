import { guardedRuntimeDatabase } from '../../scripts/database.js';

// Exact operator SQL uses SKIP LOCKED. Hold pre-existing rows so rehearsals affect only
// this invocation's fixtures, without resetting or rewriting another run's records.
export async function preserveFixtures(url: (role: string) => string, role: 'api' | 'auth') {
  const client = await guardedRuntimeDatabase(url(role), url(role === 'api' ? 'migrator' : 'auth_migrator'), role, true);
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='2s'");
    for (const table of role === 'api'
      ? ['conversations', 'feedback', 'invitations', 'idempotency_keys', 'memberships'] : ['session', 'verification']) {
      await client.query(`SELECT 1 FROM ${role === 'api' ? 'product' : 'auth'}.${table} FOR UPDATE`);
    }
    return async () => { await client.query('ROLLBACK'); await client.end(); };
  } catch (error) { await client.end(); throw error; }
}
