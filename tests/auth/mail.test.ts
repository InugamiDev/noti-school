import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { readConfig } from '../../apps/auth/src/config.js';
import { createMailer } from '../../apps/auth/src/mail.js';
import { config, origin } from './helpers.js';

function mailConfig() {
  const initial = config();
  return readConfig({ NODE_ENV: 'test', AUTH_DATABASE_URL: initial.env.AUTH_DATABASE_URL,
    BETTER_AUTH_SECRET: initial.env.BETTER_AUTH_SECRET, INTERNAL_AUTH_SECRET: initial.env.INTERNAL_AUTH_SECRET,
    SMTP_HOST: 'smtp.example.invalid', SMTP_USER: 'synthetic', SMTP_PASSWORD: 'synthetic', SMTP_FROM: 'sender@example.invalid' });
}
const message = { to: 'invitee@example.invalid', url: `${origin}/api/auth/verify-email?token=synthetic`, kind: 'verification' as const };

test('SMTP uses fixed sender and TLS, awaits acceptance, closes transport and rejects delivery failures', async () => {
  let closed = 0; let delivered = 0;
  const mail = createMailer(mailConfig(), options => {
    assert.equal(options.tls.rejectUnauthorized, true); assert.equal(options.requireTLS, true);
    assert.equal(options.logger, false); assert.equal(options.debug, false);
    return { async sendMail(input) {
      assert.equal(input.from, 'sender@example.invalid'); assert.equal(input.to, message.to);
      assert.match(String(input.text), /token=synthetic/); delivered++;
      return { accepted: [message.to], rejected: [] };
    }, close() { closed++; } };
  });
  await mail.send(message); assert.equal(delivered, 1); assert.equal(closed, 1);
  const failed = createMailer(mailConfig(), () => ({ async sendMail() { return { accepted: [], rejected: [message.to] }; }, close() {} }));
  await assert.rejects(failed.send(message), /Email unavailable/); assert.equal(failed.failed, true);
  await assert.rejects(failed.send(message), /Email unavailable/);
  const disabled = createMailer(config(), () => { throw new Error('Transport must not be created'); });
  await assert.rejects(disabled.send(message), /Email unavailable/);
});

test('SMTP delivery has an absolute eight-second deadline even if transport never resolves', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let closed = false;
  const mail = createMailer(mailConfig(), () => ({ sendMail: () => new Promise(() => {}), close() { closed = true; } }));
  const pending = mail.send(message);
  t.mock.timers.tick(8000);
  await assert.rejects(pending, /Email unavailable/); assert.equal(closed, true); assert.equal(mail.failed, true);
});

test('actual Nodemailer refuses a local SMTP peer without STARTTLS before transmitting credentials', async () => {
  const sockets = new Set<Socket>(); let commands = '';
  const sink = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket));
    socket.write('220 synthetic.example.invalid ESMTP\r\n');
    socket.on('data', chunk => {
      const command = String(chunk); commands += command;
      if (command.startsWith('EHLO')) socket.write('250-synthetic.example.invalid\r\n250 AUTH PLAIN\r\n');
      else if (command.startsWith('STARTTLS')) socket.write('454 TLS deliberately unavailable in synthetic fixture\r\n');
      else socket.write('500 unexpected synthetic command\r\n');
    });
  });
  sink.listen(0, '127.0.0.1'); await once(sink, 'listening');
  try {
    const address = sink.address(); assert.ok(address && typeof address === 'object');
    const cfg = mailConfig(); cfg.env.SMTP_HOST = '127.0.0.1'; cfg.env.SMTP_PORT = address.port;
    const mail = createMailer(cfg);
    await assert.rejects(mail.send(message), /Email unavailable/);
    assert.match(commands, /STARTTLS/); assert.doesNotMatch(commands, /^AUTH /m);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => sink.close(() => resolve()));
  }
});
