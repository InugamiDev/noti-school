import { passkey } from '@better-auth/passkey';
import type { BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';

// intent: one source for every option that shapes the identity schema, shared by the service and
// scripts/auth-migrate.ts so the migrated tables always match the runtime plugin set.
// status: done | next: coordinator runs db:auth:migrate on the dedicated database | confidence: high
export function identityPlugins(origin: string) {
  return [passkey({
    // The relying party is the exact approved APP_ORIGIN; the browser-reported Origin is never trusted.
    rpID: new URL(origin).hostname, rpName: 'noti.school', origin,
    // A passkey is only added to an existing signed-in account; it never creates or resolves a user.
    // A credential id belongs to exactly one account: the plugin does not check this and the column is not
    // unique, so a second registration of a known id could make sign-in lookups ambiguous (review finding 1).
    registration: { requireSession: true, afterVerification: async ({ ctx, verification }) => {
      const id = verification.registrationInfo?.credential.id;
      const existing = id ? await ctx.context.adapter.findMany({ model: 'passkey', where: [{ field: 'credentialID', value: id }], limit: 1 }) : [];
      if (!id || existing.length) throw new APIError('BAD_REQUEST', { message: 'Passkey could not be registered' });
    } },
    authentication: { afterVerification: async ({ ctx, clientData }) => {
      const keys = await ctx.context.adapter.findMany<{ userId: string }>({ model: 'passkey', where: [{ field: 'credentialID', value: clientData.id }], limit: 2 });
      // Refuse any ambiguous credential id outright rather than trusting whichever row the plugin read.
      const user = keys.length === 1 ? await ctx.context.internalAdapter.findUserById(keys[0]!.userId) : null;
      if (user?.emailVerified !== true) throw new APIError('FORBIDDEN', { message: 'Invitation or identity invalid' });
    } },
  })];
}

export function schemaOptions(origin: string) {
  return {
    emailAndPassword: { enabled: true }, session: { cookieCache: { enabled: false } },
    plugins: identityPlugins(origin),
  } satisfies Pick<BetterAuthOptions, 'emailAndPassword' | 'session' | 'plugins'>;
}
