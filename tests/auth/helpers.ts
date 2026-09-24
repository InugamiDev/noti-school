import { memoryAdapter } from 'better-auth/adapters/memory';
import { createIdentity } from '../../apps/auth/src/auth.js';
import { readConfig } from '../../apps/auth/src/config.js';
import { Invitations } from '../../apps/auth/src/invitations.js';
import type { IdentityMail, Mailer } from '../../apps/auth/src/mail.js';
import { createService } from '../../apps/auth/src/service.js';

export const secret = 'synthetic-test-secret-only-000000000000000';
export const origin = 'http://localhost:3000';
let fixtureId = 0;
export function config(google = false) {
  return readConfig({ NODE_ENV: 'test', AUTH_DATABASE_URL: 'postgres://noti_school_auth:synthetic@127.0.0.1/noti_school_test_auth',
    BETTER_AUTH_SECRET: secret, INTERNAL_AUTH_SECRET: secret,
    ...(google ? { GOOGLE_CLIENT_ID: 'synthetic-client', GOOGLE_CLIENT_SECRET: 'synthetic-secret' } : {}) });
}
export async function fixture(options: { google?: boolean; mailEnabled?: boolean; failMail?: boolean } = {}) {
  const peer = `192.0.2.${++fixtureId}`;
  const db: Record<string, Record<string, unknown>[]> = { user: [], account: [], session: [], verification: [] };
  const sent: IdentityMail[] = []; const calls: { path: string; body: Record<string, unknown> }[] = [];
  let failed = false;
  const mail: Mailer = {
    enabled: options.mailEnabled ?? true, get failed() { return failed; }, close() {},
    async send(value) {
      if (options.failMail || !this.enabled) { failed = true; throw new Error('Synthetic mail failure'); }
      sent.push(value);
    },
  };
  const used = new Set<string>();
  const invitations = new Invitations(secret, async (input, init) => {
    const path = String(input); const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ path, body });
    const valid = ['invite-one', 'invite-two'].includes(String(body.token)) && body.email === 'invitee@example.invalid' && !used.has(String(body.token));
    if (!valid) return Response.json({}, { status: 403 });
    if (path.endsWith('/check')) return Response.json({ valid: true });
    used.add(String(body.token));
    return Response.json({ institution_id: '11111111-1111-4111-8111-111111111111', role: 'student' });
  });
  const cfg = config(options.google);
  const auth = createIdentity(cfg, memoryAdapter(db), mail, invitations);
  const context = await auth.$context;
  const service = createService({ config: cfg, auth, mail, invitations, ready: async () => true, pause: async () => {} });
  async function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
    return service(new Request(`${origin}/api/auth${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-noti-peer-ip': peer, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
  }
  return { db, sent, calls, mail, invitations, auth, context, service, request, cfg, peer };
}
export const signup = { email: 'invitee@example.invalid', password: 'Synthetic-only-passphrase-123', name: 'Synthetic invitee' };
export function cookies(response: Response) { return response.headers.getSetCookie().map(v => v.split(';')[0]).join('; '); }
