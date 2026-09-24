import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { connect, type Socket } from 'node:net';
import type { Config } from './config.js';

export type IdentityMail = { to: string; url: string; kind: 'verification' | 'reset' | 'invitation' | 'deletion' };
export interface Mailer {
  readonly enabled: boolean;
  readonly failed: boolean;
  send(mail: IdentityMail): Promise<void>;
  close(): void;
}
export function safeMailURL(raw: string, origin: string) {
  const url = new URL(raw);
  if (url.origin !== origin || url.username || url.password || /[\r\n]/.test(raw)) throw new Error('Unsafe mail URL');
  for (const key of ['callbackURL', 'redirectTo']) {
    const target = url.searchParams.get(key);
    if (target && new URL(target, origin).origin !== origin) throw new Error('Unsafe mail callback');
  }
  return url.href;
}
export function smtpOptions(config: Config) {
  const e = config.env;
  return {
    host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_TLS_MODE === 'implicit',
    requireTLS: e.SMTP_TLS_MODE === 'starttls', ignoreTLS: false,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' as const },
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASSWORD },
    connectionTimeout: 3000, greetingTimeout: 3000, socketTimeout: 5000,
    pool: false, logger: false, debug: false,
    disableFileAccess: true, disableUrlAccess: true,
  };
}
type TransportFactory = (options: ReturnType<typeof smtpOptions>) => {
  sendMail(options: SendMailOptions): Promise<{ accepted?: unknown[]; rejected?: unknown[] }>;
  close(): void;
};
const boundedTransport: TransportFactory = options => {
  let socket: Socket | undefined;
  let closed = false;
  const transport = nodemailer.createTransport({ ...options,
    getSocket(_options: unknown, callback: (error: Error | null, result: { connection: Socket } | false) => void) {
      if (closed) { callback(new Error('Transport closed'), false); return; }
      socket = connect({ host: options.host!, port: options.port });
      const connection = socket;
      const onError = (error: Error) => { connection.destroy(); callback(error, false); };
      connection.once('error', onError);
      connection.setTimeout(3000, () => connection.destroy(new Error('SMTP connection timeout')));
      connection.once('connect', () => {
        connection.removeListener('error', onError);
        connection.setTimeout(0);
        // Nodemailer performs implicit TLS or STARTTLS on this owned TCP socket.
        callback(null, { connection });
      });
    },
  });
  return {
    sendMail: input => transport.sendMail(input),
    // SMTPTransport.close alone only frees auth resources; destroy the owned socket as well.
    close() { closed = true; socket?.destroy(); transport.close(); },
  };
};
export function createMailer(config: Config, factory: TransportFactory = boundedTransport): Mailer {
  let failed = false;
  const enabled = config.configured.email;
  return {
    enabled, get failed() { return failed; },
    async send(mail) {
      if (!enabled || failed) throw new Error('Email unavailable');
      const url = safeMailURL(mail.url, config.env.APP_ORIGIN);
      const transport = factory(smtpOptions(config));
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          transport.sendMail({
            from: config.env.SMTP_FROM!, to: mail.to,
            subject: `noti.school ${mail.kind}`,
            text: `Use this link for your noti.school ${mail.kind}:\n\n${url}\n\nIf you did not request this, ignore this email.`,
          }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => { transport.close(); reject(new Error('Mail timeout')); }, 8000); }),
        ]);
        if (!result.accepted?.length || result.rejected?.length) throw new Error('Mail rejected');
      } catch { failed = true; throw new Error('Email unavailable'); }
      finally { clearTimeout(timer); transport.close(); }
    },
    close() {},
  };
}
