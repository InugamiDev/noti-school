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
  const rejected = createMailer(mailConfig(), () => ({ async sendMail() { return { accepted: [], rejected: [message.to] }; }, close() {} }));
  for (let i = 0; i < 5; i++) await assert.rejects(rejected.send(message), /Email unavailable/);
  assert.equal(rejected.failed, false, 'Recipient rejection is not a transport failure');
  const rcpt = createMailer(mailConfig(), () => ({ async sendMail() {
    throw Object.assign(new Error('Recipient command failed'), { code: 'EENVELOPE', command: 'RCPT TO', responseCode: 550 });
  }, close() {} }));
  for (let i = 0; i < 5; i++) await assert.rejects(rcpt.send(message), /Email unavailable/);
  assert.equal(rcpt.failed, false);
  const disabled = createMailer(config(), () => { throw new Error('Transport must not be created'); });
  await assert.rejects(disabled.send(message), /Email unavailable/);
});

test('SMTP delivery has an absolute eight-second deadline even if transport never resolves', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let closed = false;
  const mail = createMailer(mailConfig(), () => ({ sendMail: () => new Promise(() => {}), close() { closed = true; } }));
  const pending = mail.send(message);
  t.mock.timers.tick(8000);
  await assert.rejects(pending, /Email unavailable/); assert.equal(closed, true); assert.equal(mail.failed, false, 'One timeout does not open the circuit');
});

test('A-05 transport circuit opens after consecutive failures, cools down, and closes on success', async () => {
  let now = 0, fail = true, created = 0;
  const mail = createMailer(mailConfig(), () => { created++; return { async sendMail() {
    if (fail) throw Object.assign(new Error('Synthetic connection failure'), { code: 'ECONNECTION' });
    return { accepted: [message.to], rejected: [] };
  }, close() {} }; }, () => now);
  for (let i = 0; i < 2; i++) await assert.rejects(mail.send(message));
  assert.equal(mail.failed, false);
  fail = false; await mail.send(message); fail = true;
  for (let i = 0; i < 2; i++) await assert.rejects(mail.send(message));
  assert.equal(mail.failed, false, 'Success resets the consecutive count');
  await assert.rejects(mail.send(message)); assert.equal(mail.failed, true);
  const before = created; await assert.rejects(mail.send(message), /Email unavailable/);
  assert.equal(created, before, 'Open circuit does not touch the transport');
  now = 60_000; assert.equal(mail.failed, false);
  await assert.rejects(mail.send(message)); assert.equal(mail.failed, true, 'Failed half-open probe reopens');
  now = 120_000; fail = false; await mail.send(message);
  fail = true; await assert.rejects(mail.send(message)); assert.equal(mail.failed, false);
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
