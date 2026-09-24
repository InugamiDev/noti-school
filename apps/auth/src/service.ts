import { IdentityCapabilities, PublicInvitationRedeem, Session } from '@noti/contracts';
import type { Config } from './config.js';
import type { Identity } from './auth.js';
import { enumerationPaths, recoveryMessage } from './auth.js';
import type { Mailer } from './mail.js';
import { InvitationError, type Invitations } from './invitations.js';
import { Admission, authorized, csrf, digest, errorResponse, RateLimit } from './security.js';

export const MAX_BODY = 16 * 1024;
const publicPaths = new Set([
  '/sign-up/email', '/sign-in/email', '/sign-in/social', '/sign-out', '/get-session',
  '/request-password-reset', '/reset-password', '/send-verification-email', '/verify-email',
  '/change-password', '/list-sessions', '/revoke-session', '/revoke-sessions', '/revoke-other-sessions',
  '/delete-user', '/delete-user/callback',
]);
const getPaths = new Set(['/get-session', '/list-sessions', '/verify-email', '/delete-user/callback', '/callback/google']);
const sensitiveLimits: Record<string, number> = {
  '/sign-in/email': 10, '/sign-up/email': 5, '/request-password-reset': 5, '/send-verification-email': 5,
};
export type SessionIdentity = {
  user: { id: string; email: string; emailVerified: boolean };
  session: { id: string; userId: string; expiresAt: Date };
};
export type SessionReader = (headers: Headers) => Promise<SessionIdentity | null>;
export function sessionReader(auth: Identity): SessionReader {
  return async headers => {
    const cookieOnly = new Headers();
    if (headers.get('cookie')) cookieOnly.set('cookie', headers.get('cookie')!);
    return auth.api.getSession({ headers: cookieOnly, query: { disableCookieCache: true, disableRefresh: true } });
  };
}
export function validSession(value: SessionIdentity | null, now = Date.now()): value is SessionIdentity {
  return !!value && value.user.emailVerified === true && value.session.userId === value.user.id
    && Number.isFinite(value.session.expiresAt.getTime()) && value.session.expiresAt.getTime() > now;
}
async function boundedRequest(request: Request) {
  const rawLength = request.headers.get('content-length');
  if (rawLength && (!/^\d+$/.test(rawLength) || Number(rawLength) > MAX_BODY)) return null;
  if (!request.body) return request;
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return new Request(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
}

export function createService(deps: {
  config: Config; auth: Identity | null; mail: Mailer; invitations: Invitations;
  readSession?: SessionReader; ready: () => Promise<boolean>;
  pause?: (ms: number) => Promise<void>;
}) {
  const { config, auth, mail, invitations } = deps;
  const internalLimit = new RateLimit(600), admission = new Admission();
  const limits = new Map<string, RateLimit>();
  // Separate maps keep anonymous churn from filling verified-user quota storage.
  for (const path of [...publicPaths, '/callback/google', '/reset-password/:token', '/invitations/redeem']) {
    for (const kind of ['user', 'admission', 'account']) limits.set(`${kind}:${path}`, new RateLimit(sensitiveLimits[path] ?? 120));
  }
  let publicActive = 0, internalActive = 0;
  const readSession = deps.readSession ?? (auth ? sessionReader(auth) : async () => null);
  const pause = deps.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const handle = async (original: Request, responseHeaders: Headers): Promise<Response> => {
    const started = Date.now();
    const url = new URL(original.url); const path = url.pathname;
    const authPath = path.slice('/api/auth'.length);
    const resetLink = /^\/reset-password\/[A-Za-z0-9_-]{1,256}$/.test(authPath);
    const flow = resetLink ? '/reset-password/:token' : authPath;
    const internal = path === '/internal/session' || path === '/internal/capabilities';
    if (url.href.length > 8192) return errorResponse(413, 'payload_too_large');
    if ([...original.headers].reduce((n, [k, v]) => n + k.length + v.length, 0) > 16384) return errorResponse(413, 'payload_too_large');
    if (path === '/healthz' && original.method === 'GET') return Response.json({ status: 'ok', contract_version: '1' });
    if (path === '/readyz' && original.method === 'GET') {
      const ready = !!auth && await deps.ready().catch(() => false);
      return Response.json({ status: ready ? 'degraded' : 'unavailable', contract_version: '1' }, { status: ready ? 200 : 503 });
    }
    if (path.startsWith('/internal/') && (!internal || original.headers.get('host') !== '127.0.0.1:3811')) return errorResponse(404, 'not_found');
    if (internal && !authorized(original.headers, config.env.INTERNAL_AUTH_SECRET)) return errorResponse(401, 'unauthenticated');
    if (!internal && (!path.startsWith('/api/auth/') || original.headers.has('authorization')
      || [...original.headers.keys()].some(k => /^(x-internal-|x-user-|x-auth-user|x-noti-user)/.test(k)))) return errorResponse(404, 'not_found');
    if (!internal && !publicPaths.has(authPath) && authPath !== '/callback/google' && authPath !== '/invitations/redeem' && !resetLink) return errorResponse(404, 'not_found');
    if (!internal && original.method !== (getPaths.has(authPath) || resetLink ? 'GET' : 'POST')) return errorResponse(400, 'invalid_request');
    if (!internal && original.method !== 'GET' && !csrf(original.headers, config.env.APP_ORIGIN, path === '/api/auth/invitations/redeem')
      && path !== '/api/auth/callback/google') return errorResponse(403, 'forbidden');
    if (!auth && !deps.readSession && path !== '/internal/capabilities') return errorResponse(503, 'core_unavailable', 'identity');
    if (internal && original.method !== 'POST') return errorResponse(400, 'invalid_request');
    if (internal ? internalActive >= 16 : publicActive >= 48) return errorResponse(503, 'core_unavailable', 'identity');
    if (internal) internalActive++; else publicActive++;
    try {
      const request = await boundedRequest(original);
      if (!request) return errorResponse(413, 'payload_too_large');
      // Validate bounded payload/header shape before charging a legitimate flow.
      if (!internal && request.method === 'POST') {
        if (!request.headers.get('content-type')?.startsWith('application/json')) return errorResponse(415, 'unsupported_media');
        try { const body: unknown = await request.clone().json(); if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse(400, 'invalid_request'); }
        catch { return errorResponse(400, 'invalid_request'); }
      }
      if (internal) {
        if ((await request.text()).length) return errorResponse(400, 'invalid_request');
        if (!internalLimit.allow(path)) return errorResponse(429, 'rate_limited');
        if (path === '/internal/capabilities') {
          const ready = !!auth && await deps.ready().catch(() => false);
          const unavailable = { state: 'unavailable', reason: 'core_failed' };
          const capability = (configured: boolean) => !ready ? unavailable : configured
            ? { state: 'available', reason: 'ready' } : { state: 'disabled', reason: 'not_configured' };
          return Response.json(IdentityCapabilities.parse({
            identity: capability(config.configured.identity), google: capability(config.configured.google),
            email: !ready ? unavailable : mail.failed ? { state: 'unavailable', reason: 'provider_failed' } : capability(mail.enabled),
          }), { headers: { 'cache-control': 'no-store' } });
        }
        const current = await readSession(request.headers);
        if (!validSession(current)) return errorResponse(401, 'unauthenticated');
        return Response.json(Session.parse({ user_id: current.user.id, session_id: current.session.id,
          email_verified: true, expires_at: current.session.expiresAt.toISOString() }), { headers: { 'cache-control': 'no-store' } });
      }
      const current = await readSession(request.headers);
      let identity: string, kind: string;
      if (validSession(current)) { identity = digest(current.user.id); kind = 'user'; }
      else {
        const admitted = admission.identify(request.headers, config.env.NODE_ENV === 'production');
        if (!admitted) return errorResponse(429, 'rate_limited');
        identity = admitted.id; kind = 'admission';
        if (admitted.cookie) responseHeaders.append('set-cookie', admitted.cookie);
      }
      if (!limits.get(`${kind}:${flow}`)!.allow(identity)) return errorResponse(429, 'rate_limited');
      if (sensitiveLimits[flow] && request.method === 'POST') {
        const body = await request.clone().json() as { email?: unknown };
        if (typeof body.email === 'string' && body.email.length <= 254
          && !limits.get(`account:${flow}`)!.allow(digest(body.email.trim().toLowerCase()))) return errorResponse(429, 'rate_limited');
      }
      if (path === '/api/auth/invitations/redeem') {
        if (request.method !== 'POST') return errorResponse(400, 'invalid_request');
        if (!validSession(current)) return errorResponse(401, 'unauthenticated');
        if (!request.headers.get('content-type')?.startsWith('application/json')) return errorResponse(415, 'unsupported_media');
        let input: unknown;
        try { input = await request.json(); } catch { return errorResponse(400, 'invalid_request'); }
        const parsed = PublicInvitationRedeem.safeParse(input);
        if (!parsed.success) return errorResponse(400, 'invalid_request');
        const result = await invitations.redeem({ token: parsed.data.token, user_id: current.user.id,
          email: current.user.email, email_verified: true });
        return Response.json(result, { headers: { 'cache-control': 'no-store' } });
      }
      if ((authPath === '/sign-up/email' || authPath === '/delete-user' || enumerationPaths.has(authPath)) && (!mail.enabled || mail.failed)) return errorResponse(503, 'provider_unavailable', 'email');
      if ((authPath === '/sign-in/social' || authPath === '/callback/google') && !config.configured.google) return errorResponse(503, 'provider_unavailable', 'google');
      const response = await auth!.handler(request);
      if (enumerationPaths.has(authPath) && (response.ok || response.status >= 500)) {
        // Bound timing differences and never report queueing/delivery or distinguish a missing account.
        await pause(Math.max(0, 8500 - (Date.now() - started)));
        return Response.json(recoveryMessage, { headers: { 'cache-control': 'no-store' } });
      }
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store'); headers.set('referrer-policy', 'no-referrer');
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof InvitationError) return errorResponse(error.unavailable ? 503 : 403, error.unavailable ? 'core_unavailable' : 'forbidden');
      return errorResponse(503, 'core_unavailable', 'identity');
    } finally { if (internal) internalActive--; else publicActive--; }
  };
  return async (original: Request): Promise<Response> => {
    const headers = new Headers();
    const response = await handle(original, headers);
    for (const cookie of headers.getSetCookie()) response.headers.append('set-cookie', cookie);
    return response;
  };
}
