import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { guardedDatabase } from './database.js';

export async function migrate(raw: string | undefined, testOnly = false) {
  const client = await guardedDatabase(raw, 'migrator', testOnly);
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(718443900)');
    await client.query('CREATE TABLE IF NOT EXISTS product.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(f => /^\d{4}_[a-z_]+\.sql$/.test(f)).sort();
    for (const name of files) {
      const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query<{ sha256: string }>('SELECT sha256 FROM product.schema_migrations WHERE name = $1', [name]);
      if (existing.rows[0]) { if (existing.rows[0].sha256 !== hash) throw new Error('Applied migration checksum changed'); continue; }
      await client.query(sql);
      await client.query('INSERT INTO product.schema_migrations(name,sha256) VALUES($1,$2)', [name, hash]);
    }
    // Runtime cannot rewrite migration history, even after broad initial data grants.
    await client.query('REVOKE ALL ON product.schema_migrations FROM noti_school_api');
    await client.query('COMMIT');
    console.log(`Product migrations checked/applied: ${files.length}`);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NOTI_MIGRATION_ACK !== 'dedicated-noti-school') throw new Error('Set NOTI_MIGRATION_ACK=dedicated-noti-school after reviewing target');
  try { await migrate(process.env.NOTI_MIGRATION_URL); }
  catch { console.error('Migration failed (connection details redacted). Inspect dedicated target and migration prerequisites.'); process.exitCode = 1; }
}
