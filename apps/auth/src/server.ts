import { createServer } from 'node:http';
import { loadEnvFile } from 'node:process';
import pg from 'pg';
import { toNodeHandler } from 'better-auth/node';
import { readConfig } from './config.js';
import { createIdentity } from './auth.js';
import { Invitations } from './invitations.js';
import { createMailer } from './mail.js';
import { createService } from './service.js';

// intent: production Node listener only, with optional credentials loaded explicitly server-side.
// status: implemented; next: coordinator configures credentials and starts existing PM2 process.
try {
  if (process.env.NOTI_ENV_FILE) loadEnvFile(process.env.NOTI_ENV_FILE);
  const config = readConfig(process.env);
  const mail = createMailer(config);
  const pool = config.configured.identity ? new pg.Pool({
    connectionString: config.env.AUTH_DATABASE_URL!, options: '-c search_path=auth', max: 5,
    connectionTimeoutMillis: 1000, statement_timeout: 1200, query_timeout: 1500, idleTimeoutMillis: 10_000,
  }) : null;
  pool?.on('error', () => { console.error('Identity database connection unavailable'); });
  const invitations = new Invitations(config.env.INTERNAL_AUTH_SECRET ?? '');
  const auth = pool ? createIdentity(config, pool, mail, invitations) : null;
  const service = createService({ config, auth, mail, invitations, ready: async () => {
    if (!pool) return false;
    await pool.query('SELECT 1'); return true;
  } });
  const handler = toNodeHandler(service);
  const server = createServer({ maxHeaderSize: 16_384, requestTimeout: 12_000, headersTimeout: 5000,
    keepAliveTimeout: 5000 }, (req, res) => {
    for (const key of Object.keys(req.headers)) {
      if (/^(forwarded|x-forwarded-|cf-connecting-ip|x-real-ip|x-noti-peer-ip)/.test(key)) delete req.headers[key];
    }
    req.headers['x-noti-peer-ip'] = req.socket.remoteAddress ?? '127.0.0.1';
    req.setTimeout(12_000, () => req.destroy());
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    void handler(req, res).catch(() => { if (!res.headersSent) res.writeHead(503); res.end(); });
  });
  server.maxConnections = 100;
  server.maxRequestsPerSocket = 100;
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 12_000);
    server.close(() => { void (async () => { mail.close(); await pool?.end(); clearTimeout(deadline); })().catch(() => process.exit(1)); });
    server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  server.once('error', () => { console.error('Identity listener failed'); shutdown(); process.exitCode = 1; });
  server.listen(3811, '127.0.0.1', () => { console.log('Identity listener ready on loopback; credential presence is not provider verification'); });
} catch { console.error('Identity startup rejected invalid configuration'); process.exitCode = 1; }
