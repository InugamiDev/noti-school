import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { open, unlink, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, dirname, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { z } from 'zod';
import type pg from 'pg';
import { guardedDatabase, guardedRuntimeDatabase } from './database.js';

// intent: explicit operator actions, never boot hooks; status: implemented.
// next: coordinator supplies reviewed targets, recipients and prices outside this rehearsal.
export const Bootstrap = z.strictObject({
  email: z.email().max(254).transform(v => v.trim().toLowerCase()),
  role: z.enum(['admin', 'student']), output: z.string().min(1),
  expires_hours: z.number().int().min(1).max(168).default(24),
});
export const Price = z.strictObject({
  id: z.string().min(1).max(200), provider: z.enum(['openai', 'jev']),
  model: z.string().trim().min(1).max(200),
  component: z.enum(['input_tokens', 'output_tokens', 'embedding_tokens', 'search_calls', 'search_content_tokens', 'jev_input_tokens', 'jev_output_tokens']),
  units: z.literal('micro_usd_per_million_units'),
  micro_usd_per_million_units: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  effective_at: z.iso.datetime({ offset: true }), valid_until: z.iso.datetime({ offset: true }),
  source_url: z.url({ protocol: /^https$/ }).refine(v => { const u = new URL(v); return !u.username && !u.password; }),
}).refine(v => Date.parse(v.valid_until) > Date.parse(v.effective_at), 'Invalid price window')
  .refine(v => (v.provider === 'jev') === v.component.startsWith('jev_'), 'Provider/component mismatch');

export async function bootstrap(client: pg.Client, input: unknown, secret: string) {
  const value = Bootstrap.parse(input);
  if (secret.length < 32) throw new Error('Dedicated internal invitation hashing secret required');
  const output = resolve(await realpath(dirname(value.output)), basename(value.output));
  const inside = relative(await realpath(fileURLToPath(new URL('../', import.meta.url))), output);
  if (!isAbsolute(value.output) || !(inside === '..' || inside.startsWith('../'))) throw new Error('Private output must be an absolute path outside the checkout');
  const file = await open(output, 'wx', 0o600);
  const token = randomBytes(32).toString('base64url');
  const institution = randomUUID(), invitation = randomUUID();
  // This random non-login principal exists solely to authorize this operator-issued invitation.
  const issuer = `operator:${randomUUID()}`;
  try {
    await file.chmod(0o600);
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>("INSERT INTO product.institutions(id,slug,name,coverage) VALUES($1,'hcmiu','HCMIU','none') ON CONFLICT(slug) DO NOTHING RETURNING id", [institution]);
    const id = result.rows[0]?.id ?? (await client.query<{ id: string }>("SELECT id FROM product.institutions WHERE slug='hcmiu'")).rows[0]!.id;
    await client.query("INSERT INTO product.memberships(institution_id,user_id,role) VALUES($1,$2,'admin')", [id, issuer]);
    await client.query("INSERT INTO product.invitations(id,institution_id,token_hash,email_hash,role,expires_at,created_by) VALUES($1,$2,$3,$4,$5,now()+$6*interval '1 hour',$7)", [
      invitation, id, createHash('sha256').update(token).digest('hex'),
      createHmac('sha256', secret).update(value.email).digest('hex'), value.role, value.expires_hours, issuer,
    ]);
    await file.writeFile(JSON.stringify({ institution_id: id, invitation_id: invitation, token, email: value.email, role: value.role }) + '\n');
    await file.sync();
    await client.query('COMMIT');
    return { institution_id: id, invitation_id: invitation };
  } catch (error) {
    try { await client.query('ROLLBACK'); } finally { await unlink(output); }
    throw error;
  } finally { await file.close(); }
}

export async function importPrices(client: pg.Client, input: unknown) {
  const prices = z.array(Price).min(1).max(100).parse(input);
  if (new Set(prices.map(p => p.id)).size !== prices.length) throw new Error('Duplicate price IDs');
  await client.query('BEGIN');
  try {
    for (const p of prices) await client.query(
      'INSERT INTO product.ai_prices(id,provider,model,component,micro_usd_per_million_units,effective_at,valid_until,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [p.id, p.provider, p.model, p.component, p.micro_usd_per_million_units, p.effective_at, p.valid_until, p.source_url],
    );
    await client.query('COMMIT'); return { inserted: prices.length };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export const Retention = z.strictObject({ days: z.number().int().min(30).max(3650).default(30), limit: z.number().int().min(1).max(1000).default(100) });
export async function retainIdentityData(client: pg.Client, input: unknown) {
  const { limit } = Retention.parse(input);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL statement_timeout = '5s'");
    const sessions = await client.query('DELETE FROM auth.session WHERE id IN (SELECT id FROM auth.session WHERE "expiresAt" < now() ORDER BY "expiresAt",id LIMIT $1 FOR UPDATE SKIP LOCKED)', [limit]);
    const verification = await client.query('DELETE FROM auth.verification WHERE id IN (SELECT id FROM auth.verification WHERE "expiresAt" < now() ORDER BY "expiresAt",id LIMIT $1 FOR UPDATE SKIP LOCKED)', [limit]);
    await client.query('COMMIT'); return { sessions: sessions.rowCount, verification: verification.rowCount };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
export async function retainPersonalData(client: pg.Client, input: unknown) {
  const { days, limit } = Retention.parse(input);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '5s'");
    // Each table slice is bounded. Conversation cascades intentionally remove its answers/citations/feedback.
    await client.query('SELECT pg_advisory_xact_lock(718443901)');
    const conversations = await client.query("DELETE FROM product.conversations WHERE id IN (SELECT id FROM product.conversations WHERE created_at < now()-$1*interval '1 day' ORDER BY created_at,id LIMIT $2 FOR UPDATE SKIP LOCKED)", [days, limit]);
    const feedback = await client.query("DELETE FROM product.feedback WHERE id IN (SELECT id FROM product.feedback WHERE created_at < now()-$1*interval '1 day' ORDER BY created_at,id LIMIT $2 FOR UPDATE SKIP LOCKED)", [days, limit]);
    const invitations = await client.query("DELETE FROM product.invitations WHERE id IN (SELECT id FROM product.invitations WHERE expires_at < now()-$1*interval '1 day' ORDER BY expires_at,id LIMIT $2 FOR UPDATE SKIP LOCKED)", [days, limit]);
    // Stage-linked roots are operational audit records; their FK must survive cache expiry.
    // Unresolved charges also keep legacy replay fences. Neither path releases reserved funds.
    const idempotency = await client.query("DELETE FROM product.idempotency_keys WHERE ctid IN (SELECT k.ctid FROM product.idempotency_keys k WHERE k.expires_at < now() AND k.state IN ('completed','failed') AND NOT EXISTS(SELECT 1 FROM product.pipeline_stages p WHERE p.root_operation_id=k.operation_id) AND NOT EXISTS(SELECT 1 FROM product.ai_reservations WHERE state IN ('reserved','dispatched','uncertain')) ORDER BY k.expires_at LIMIT $1 FOR UPDATE OF k SKIP LOCKED)", [limit]);
    const issuers = await client.query("DELETE FROM product.memberships m WHERE m.ctid IN (SELECT p.ctid FROM product.memberships p WHERE p.user_id LIKE 'operator:%' AND NOT EXISTS(SELECT 1 FROM product.invitations i WHERE i.created_by=p.user_id) LIMIT $1 FOR UPDATE SKIP LOCKED)", [limit]);
    await client.query('COMMIT');
    return { conversations: conversations.rowCount, feedback: feedback.rowCount, invitations: invitations.rowCount, idempotency: idempotency.rowCount, issuers: issuers.rowCount };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}

export async function operator(argv: string[], env: NodeJS.ProcessEnv) {
  const [command, inputFile] = argv;
  if (!['bootstrap', 'prices', 'retention'].includes(command ?? '') || !inputFile || argv.length !== 2) throw new Error('Usage: operator bootstrap|prices|retention /private/input.json');
  if (env.NOTI_OPERATOR_ACK !== 'dedicated-noti-school') throw new Error('Dedicated operator acknowledgement required');
  const testOnly = env.NOTI_TEST_ACK === 'disposable-noti-school';
  if (command === 'prices' && env.NOTI_PRICING_ACK !== 'reviewed-dated-prices') throw new Error('Reviewed dated pricing acknowledgement required');
  const client = command === 'prices' ? await guardedDatabase(env.NOTI_MIGRATION_URL, 'migrator', testOnly)
    : await guardedRuntimeDatabase(env.DATABASE_URL, env.NOTI_MIGRATION_URL, 'api', testOnly);
  try {
    const input = JSON.parse(await readFile(inputFile, 'utf8')) as unknown;
    if (command === 'bootstrap') return await bootstrap(client, input, env.INTERNAL_AUTH_SECRET ?? '');
    if (command === 'prices') return await importPrices(client, input);
    // Validate both targets before any deletes. The two bounded transactions can be safely rerun.
    const productTarget = new URL(env.DATABASE_URL!);
    const authTarget = new URL(env.AUTH_DATABASE_URL!);
    if (productTarget.host !== authTarget.host || productTarget.pathname !== authTarget.pathname) throw new Error('Retention databases differ');
    const auth = await guardedRuntimeDatabase(env.AUTH_DATABASE_URL, env.NOTI_AUTH_MIGRATION_URL, 'auth', testOnly);
    try { return { product: await retainPersonalData(client, input), identity: await retainIdentityData(auth, input) }; }
    finally { await auth.end(); }
  } finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await operator(process.argv.slice(2), process.env); console.log(JSON.stringify(result)); }
  catch { console.error('Operator action failed; inspect target, acknowledgements and private input. No token is logged.'); process.exitCode = 1; }
}
