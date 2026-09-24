import { parseEnvironment } from '../../../packages/contracts/src/env.js';

export function readConfig(input: Record<string, string | undefined>) {
  const config = parseEnvironment(input, 'auth');
  const expected = config.env.NODE_ENV === 'production' ? 'https://noti.school' : 'http://localhost:3000';
  if (config.env.APP_ORIGIN !== expected) throw new Error('Auth origin is not approved');
  if (input.BETTER_AUTH_TRUSTED_ORIGINS) throw new Error('Additional auth origins are not allowed');
  if (input.BETTER_AUTH_TELEMETRY || input.BETTER_AUTH_TELEMETRY_ENDPOINT) throw new Error('Auth telemetry environment overrides are not allowed');
  return config;
}
export type Config = ReturnType<typeof readConfig>;
