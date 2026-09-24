import pg from 'pg';
import { getMigrations } from 'better-auth/db/migration';
import { guardedDatabase } from './database.js';

// intent: let the pinned library own identity DDL; never hand-maintain its core tables.
if (process.env.NOTI_MIGRATION_ACK !== 'dedicated-noti-school') throw new Error('Explicit dedicated database acknowledgement required');
const raw = process.env.NOTI_AUTH_MIGRATION_URL;
const guard = await guardedDatabase(raw, 'auth_migrator');
const pool = new pg.Pool({ connectionString: raw!, options: '-c search_path=auth', max: 1, connectionTimeoutMillis: 3000 });
try {
  await guard.query('SELECT pg_advisory_lock(718443902)');
  const migration = await getMigrations({ database: pool, emailAndPassword: { enabled: true }, session: { cookieCache: { enabled: false } } });
  await migration.runMigrations();
  await guard.query('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO noti_school_auth');
  await guard.query('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO noti_school_auth');
  console.log('Better Auth 1.7.6 core schema migrated; runtime config must use this same schema shape, no plugins or additional fields.');
} catch { console.error('Identity migration failed (details redacted); inspect auth schema with migration role.'); process.exitCode = 1; }
finally { await pool.end(); await guard.end(); }
