import { parseEnvironment } from '../packages/contracts/src/env.js';
try {
  const { configured, env } = parseEnvironment(process.env);
  console.log(JSON.stringify({ mode: env.AI_MODE, configured, note: 'Configuration presence only; readiness also requires DB, provider, pricing and budget checks.' }));
} catch { console.error('Invalid environment; check docs/contracts/environment.md (values redacted).'); process.exitCode = 1; }
