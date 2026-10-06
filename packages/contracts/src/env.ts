import { z } from 'zod';

const optional = z.string().trim().min(1).optional();
const boolean = z
  .enum(['true', 'false'])
  .default('false')
  .transform((v) => v === 'true');
export const Environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: optional,
  AUTH_DATABASE_URL: optional,
  BETTER_AUTH_SECRET: optional,
  INTERNAL_AUTH_SECRET: optional,
  API_BIND_ADDRESS: z.literal('127.0.0.1:3810').default('127.0.0.1:3810'),
  AUTH_BIND_HOST: z.literal('127.0.0.1').default('127.0.0.1'),
  AUTH_PORT: z.literal('3811').default('3811'),
  AUTH_INTERNAL_URL: z.literal('http://127.0.0.1:3811').default('http://127.0.0.1:3811'),
  AI_LIVE_CALLS_ENABLED: boolean,
  EVIDENCE_PROVIDER: z.enum(['openai', 'jev']).default('openai'),
  AI_MODE: z.enum(['disabled', 'mock', 'live']).default('disabled'),
  AI_MONTHLY_BUDGET_USD: z.literal('50').default('50'),
  OPENAI_API_KEY: optional,
  TYPESAFE_API_KEY: optional,
  OPENAI_CHAT_MODEL: optional,
  OPENAI_EMBEDDING_MODEL: z.literal('text-embedding-3-small').default('text-embedding-3-small'),
  EMBEDDING_DIMENSIONS: z.literal('1536').default('1536'),
  JEV_MODEL: z.literal('jev-1.13.0').default('jev-1.13.0'),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: optional,
  SMTP_PASSWORD: optional,
  SMTP_FROM: z.email().optional(),
  SMTP_TLS_MODE: z.enum(['starttls', 'implicit']).default('starttls'),
  REGISTRATION_MODE: z.literal('invite_only').default('invite_only'),
  WEB_DIST_DIR: z.string().default('./apps/web/dist'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
});

export function databaseTarget(
  raw: string,
  role: 'api' | 'auth' | 'migrator' | 'auth_migrator',
  testOnly = false,
) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid database URL');
  }
  const db = url.pathname.slice(1);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    (db !== 'noti_school' && !/^noti_school_test_[a-z0-9_]{1,40}$/.test(db)) ||
    (testOnly && !db.startsWith('noti_school_test_')) ||
    url.username !== `noti_school_${role}` ||
    !url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Database isolation guard rejected target');
  return { database: db, role: url.username, host: url.hostname, port: url.port || '5432' };
}

export function parseEnvironment(
  input: Record<string, string | undefined>,
  service: 'api' | 'auth' | 'combined' = 'combined',
) {
  if (
    Object.keys(input).some(
      (k) => k.startsWith('VITE_') && /KEY|SECRET|PASSWORD|DATABASE|TOKEN/i.test(k),
    )
  )
    throw new Error('Server credentials must not use VITE_ variables');
  const env = Environment.parse(
    Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v === '' ? undefined : v])),
  );
  const origin = new URL(env.APP_ORIGIN);
  if (
    origin.origin !== env.APP_ORIGIN ||
    origin.username ||
    origin.password ||
    (env.NODE_ENV === 'production'
      ? origin.protocol !== 'https:'
      : !['http:', 'https:'].includes(origin.protocol))
  )
    throw new Error('APP_ORIGIN must be an exact allowed origin');
  if (env.NODE_ENV === 'production' && env.AI_MODE === 'mock')
    throw new Error('Mock mode is forbidden in production');
  if (env.AI_LIVE_CALLS_ENABLED !== (env.AI_MODE === 'live'))
    throw new Error('Live mode and paid-call switch must agree');
  if (env.DATABASE_URL) databaseTarget(env.DATABASE_URL, 'api');
  if (env.AUTH_DATABASE_URL) databaseTarget(env.AUTH_DATABASE_URL, 'auth');
  for (const secret of [env.BETTER_AUTH_SECRET, env.INTERNAL_AUTH_SECRET])
    if (secret && secret.length < 32)
      throw new Error('Configured service secrets require at least 32 characters');
  const identity =
    service === 'api'
      ? !!env.INTERNAL_AUTH_SECRET
      : !!(env.AUTH_DATABASE_URL && env.BETTER_AUTH_SECRET && env.INTERNAL_AUTH_SECRET);
  const providers = !!(
    env.OPENAI_API_KEY &&
    env.OPENAI_CHAT_MODEL &&
    (env.EVIDENCE_PROVIDER === 'openai' || env.TYPESAFE_API_KEY)
  );
  return {
    env,
    configured: {
      identity,
      core: identity && (service === 'auth' || !!env.DATABASE_URL),
      providers,
      google: identity && !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      email: identity && !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM),
    },
  };
}
