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
    registration: { requireSession: true },
    authentication: { afterVerification: async ({ ctx, clientData }) => {
      const key = await ctx.context.adapter.findOne<{ userId: string }>({ model: 'passkey', where: [{ field: 'credentialID', value: clientData.id }] });
      const user = key ? await ctx.context.internalAdapter.findUserById(key.userId) : null;
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
