import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function equalSecret(actual: string, expected: string) {
  return timingSafeEqual(Buffer.from(digest(actual), 'hex'), Buffer.from(digest(expected), 'hex'));
}
export function authorized(headers: Headers, secret: string | undefined) {
  return !!secret && equalSecret(headers.get('authorization') ?? '', `Bearer ${secret}`);
}
export function csrf(headers: Headers, origin: string, custom = false) {
  return headers.get('origin') === origin && headers.get('sec-fetch-site') !== 'cross-site'
    && (!custom || headers.get('x-noti-csrf') === '1');
}
export function errorResponse(status: number, code: string, capability?: 'identity' | 'email' | 'google') {
  return Response.json({ error: {
    code, message: code.replaceAll('_', ' '), request_id: randomUUID(),
    retryable: status === 503 || status === 429, ...(capability ? { capability } : {}),
  } }, { status, headers: { 'cache-control': 'no-store' } });
}

// intent: bound pilot abuse without trusting proxy/client-controlled IP headers.
// status: implemented; next: coordinator may configure verified proxy identity after ingress audit.
export class RateLimit {
  // Fixed windows start at insertion, so Map order is also expiry order (oldest first).
  private readonly counts = new Map<string, { count: number; until: number }>();
  constructor(private readonly maximum: number, private readonly windowMs = 60_000, private readonly maxKeys = 4096) {}
  private current(key: string, now: number) {
    for (const [k, entry] of this.counts) { if (entry.until > now) break; this.counts.delete(k); }
    const entry = this.counts.get(key);
    if (entry && entry.until <= now) { this.counts.delete(key); return undefined; }
    return entry;
  }
  allow(key: string, now = Date.now()) {
    let entry = this.current(key, now);
    if (!entry) {
      // Evict the oldest window instead of refusing every new key; callers bound key creation upstream.
      if (this.counts.size >= this.maxKeys) this.counts.delete(this.counts.keys().next().value!);
      entry = { count: 0, until: now + this.windowMs };
      this.counts.set(key, entry);
    }
    return ++entry.count <= this.maximum;
  }
  has(key: string, now = Date.now()) { return !!this.current(key, now); }
  blocked(key: string, now = Date.now()) { return (this.current(key, now)?.count ?? 0) >= this.maximum; }
  renew(key: string, now = Date.now()) { this.counts.delete(key); return this.allow(key, now); }
  forget(key: string) { this.counts.delete(key); }
}

// intent: bounded anonymous admission without assigning every tunnel user the loopback address.
// status: implemented; next: trusted ingress must supply distributed abuse protection.
export class Admission {
  private readonly secret = randomBytes(32);
  // Issuance is stateless; the global budget is charged only when a signed admission is first presented,
  // so cookie-stripping clients cannot exhaust it. Cookieless or over-budget requests share one quota key.
  private readonly activation = new RateLimit(120);
  private readonly active = new RateLimit(Number.MAX_SAFE_INTEGER, 600_000, 8192);
  private readonly name = 'noti.admission';
  private sign(value: string) { return createHmac('sha256', this.secret).update(value).digest('hex'); }
  identify(headers: Headers, secure: boolean, now = Date.now()): { id: string; shared: boolean; cookie?: string } {
    const token = headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${this.name}=`))?.slice(this.name.length + 1);
    if (token && /^[a-f0-9]{32}\.[0-9]{13}\.[a-f0-9]{64}$/.test(token)) {
      const [id, expiry, signature] = token.split('.') as [string, string, string];
      if (Number(expiry) > now && Number(expiry) <= now + 600_000 && equalSecret(signature, this.sign(`${id}.${expiry}`))) {
        if (this.active.has(id, now)) return { id, shared: false };
        if (!this.activation.allow('new', now)) return { id, shared: true };
        this.active.allow(id, now); return { id, shared: false };
      }
    }
    const id = randomBytes(16).toString('hex'), value = `${id}.${now + 600_000}`;
    return { id, shared: true, cookie: `${this.name}=${value}.${this.sign(value)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure ? '; Secure' : ''}` };
  }
}
