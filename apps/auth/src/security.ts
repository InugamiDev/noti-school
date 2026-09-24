import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

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
  private readonly counts = new Map<string, { count: number; until: number }>();
  constructor(private readonly maximum: number, private readonly windowMs = 60_000, private readonly maxKeys = 4096) {}
  allow(key: string, now = Date.now()) {
    for (const [k, entry] of this.counts) if (entry.until <= now) this.counts.delete(k);
    let entry = this.counts.get(key);
    if (!entry) {
      if (this.counts.size >= this.maxKeys) return false;
      entry = { count: 0, until: now + this.windowMs };
      this.counts.set(key, entry);
    }
    return ++entry.count <= this.maximum;
  }
}
