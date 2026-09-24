import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { AsyncLocalStorage } from 'node:async_hooks';
import { addOAuthServerContext, APIError, createAuthMiddleware, getOAuthState } from 'better-auth/api';
import type { Config } from './config.js';
import type { Mailer } from './mail.js';
import { InvitationError, Invitations, invitationHeader, PendingInvitation } from './invitations.js';
import { csrf, digest, equalSecret } from './security.js';

type VerificationStore = {
  createVerificationValue(value: { identifier: string; value: string; expiresAt: Date }): Promise<unknown>;
  consumeVerificationValue(identifier: string): Promise<unknown>;
};
export const enumerationPaths = new Set(['/request-password-reset', '/send-verification-email']);
export const recoveryMessage = { status: true, message: 'If this account is eligible, the request is processed. Email delivery is not confirmed.' };

function forbidden() { return new APIError('FORBIDDEN', { message: 'Invitation or identity invalid' }); }
function unavailable() { return new APIError('SERVICE_UNAVAILABLE', { message: 'Email unavailable' }); }
async function checkInvitation(invitations: Invitations, token: string | undefined, email: string) {
  if (!token) throw forbidden();
  try { await invitations.check(token, email); }
  catch (error) {
    if (error instanceof InvitationError && error.unavailable) throw new APIError('SERVICE_UNAVAILABLE', { message: 'Invitation service unavailable' });
    throw forbidden();
  }
}

// intent: keep identity in Better Auth and product grants in Rust, with request-local OAuth state.
// status: implemented; next: isolated PostgreSQL and real provider rehearsal by coordinator.
export function authOptions(config: Config, database: BetterAuthOptions['database'], mail: Mailer,
  invitations: Invitations, verificationStore: () => Promise<VerificationStore>,
  delivery: AsyncLocalStorage<{ failed: boolean }>): BetterAuthOptions {
  const origin = config.env.APP_ORIGIN;
  return {
    appName: 'noti.school', baseURL: origin, basePath: '/api/auth', secret: config.env.BETTER_AUTH_SECRET!,
    database, trustedOrigins: [origin],
    logger: { disabled: true },
    telemetry: { enabled: false },
    onAPIError: { errorURL: `${origin}/auth/error` },
    advanced: {
      disableOriginCheck: false, disableCSRFCheck: false,
      useSecureCookies: config.env.NODE_ENV === 'production',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      crossSubDomainCookies: { enabled: false },
      ipAddress: { ipAddressHeaders: ['x-noti-peer-ip'] },
    },
    rateLimit: { enabled: true, storage: 'memory', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 10 }, '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 5 }, '/send-verification-email': { window: 60, max: 5 } } },
    session: { cookieCache: { enabled: false }, expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
    account: { accountLinking: { enabled: false }, storeStateStrategy: 'database', skipStateCookieCheck: false,
      storeAccountCookie: false, encryptOAuthTokens: true },
    user: { changeEmail: { enabled: false }, deleteUser: { enabled: false } },
    emailAndPassword: {
      enabled: true, requireEmailVerification: true, autoSignIn: false,
      minPasswordLength: 12, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({ user, url }) => { await mail.send({ to: user.email, url, kind: 'reset' }); },
    },
    emailVerification: {
      sendOnSignUp: true, sendOnSignIn: false, autoSignInAfterVerification: false, expiresIn: 1800,
      sendVerificationEmail: async ({ user, url, token }) => {
        try {
          await (await verificationStore()).createVerificationValue({
            identifier: `noti-email:${digest(token)}`, value: user.id, expiresAt: new Date(Date.now() + 1800_000),
          });
          await mail.send({ to: user.email, url, kind: 'verification' });
        } catch {
          const state = delivery.getStore();
          if (state) state.failed = true;
          throw unavailable();
        }
      },
    },
    socialProviders: config.configured.google ? { google: {
      clientId: config.env.GOOGLE_CLIENT_ID!, clientSecret: config.env.GOOGLE_CLIENT_SECRET!,
      scope: ['openid', 'email', 'profile'], disableIdTokenSignIn: true,
      redirectURI: `${origin}/api/auth/callback/google`,
    } } : {},
    hooks: {
      before: createAuthMiddleware(async ctx => {
        const path = ctx.path ?? '';
        if (ctx.request?.method === 'POST' && !path.startsWith('/callback/') && !csrf(ctx.headers ?? new Headers(), origin)) {
          throw new APIError('FORBIDDEN', { message: 'Origin invalid' });
        }
        // The only invitation input is a bounded header on a same-origin request. No roles are accepted.
        if (['/sign-up/email', '/sign-in/social'].includes(path)) {
          if (ctx.body && ['role', 'institution_id', 'emailVerified', 'user_id', 'additionalData'].some(k => k in ctx.body)) throw forbidden();
        }
        if (path === '/sign-up/email' || enumerationPaths.has(path)) {
          if (!mail.enabled || mail.failed) throw unavailable();
        }
        if (path === '/sign-up/email') {
          await checkInvitation(invitations, invitationHeader(ctx.headers), String(ctx.body?.email ?? ''));
        }
        if (path === '/sign-in/social') {
          if (!config.configured.google) throw new APIError('SERVICE_UNAVAILABLE', { message: 'Google unavailable' });
          if (ctx.body?.provider !== 'google' || ctx.body?.idToken || ctx.body?.scopes || ctx.body?.loginHint) throw forbidden();
          const token = invitationHeader(ctx.headers);
          if (token) await addOAuthServerContext({ invitation: { token, expiresAt: Date.now() + 300_000 } });
        }
        if (path.startsWith('/callback/')) {
          if (!config.configured.google || ctx.params?.id !== 'google') throw forbidden();
          const state = ctx.query?.state ?? ctx.body?.state;
          if (typeof state !== 'string' || state.length > 256) throw forbidden();
          const cookie = ctx.context.createAuthCookie('state');
          const browserState = await ctx.getSignedCookie(cookie.name, ctx.context.secret);
          if (!browserState || !equalSecret(browserState, state)) throw forbidden();
          // Consume a separate core-table marker atomically before Better Auth reads/deletes OAuth state.
          if (!await ctx.context.internalAdapter.consumeVerificationValue(`noti-oauth:${digest(state)}`)) throw forbidden();
        }
        if (path === '/verify-email') {
          const token = ctx.query?.token;
          if (typeof token !== 'string' || !await ctx.context.internalAdapter.consumeVerificationValue(`noti-email:${digest(token)}`)) {
            throw new APIError('UNAUTHORIZED', { message: 'Verification invalid or expired' });
          }
        }
      }),
      after: createAuthMiddleware(async ctx => {
        // Better Auth deliberately catches mail callback exceptions; restore truthful signup failure.
        if (ctx.path === '/sign-up/email' && (delivery.getStore()?.failed || mail.failed)) throw unavailable();
        if (ctx.path === '/sign-in/social') {
          const result = ctx.context.returned as { url?: unknown } | undefined;
          if (typeof result?.url === 'string') {
            const state = new URL(result.url).searchParams.get('state');
            if (state) await ctx.context.internalAdapter.createVerificationValue({
              identifier: `noti-oauth:${digest(state)}`, value: 'pending', expiresAt: new Date(Date.now() + 300_000),
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: { create: { before: async (user, ctx) => {
        let token: string | undefined;
        if (ctx?.path === '/sign-up/email') token = invitationHeader(ctx.headers);
        else if (ctx?.path?.startsWith('/callback/') && ctx.params?.id === 'google') {
          const pending = PendingInvitation.safeParse((await getOAuthState())?.serverContext?.invitation);
          if (!pending.success || pending.data.expiresAt <= Date.now() || user.emailVerified !== true) throw forbidden();
          token = pending.data.token;
        }
        await checkInvitation(invitations, token, user.email);
        return { data: user };
      } } },
    },
  };
}

export function createIdentity(config: Config, database: BetterAuthOptions['database'], mail: Mailer, invitations: Invitations) {
  const delivery = new AsyncLocalStorage<{ failed: boolean }>();
  const auth = betterAuth(authOptions(config, database, mail, invitations, async (): Promise<VerificationStore> => (await auth.$context).internalAdapter, delivery));
  const handler = auth.handler;
  auth.handler = request => delivery.run({ failed: false }, () => handler(request));
  return auth;
}
export type Identity = ReturnType<typeof createIdentity>;
