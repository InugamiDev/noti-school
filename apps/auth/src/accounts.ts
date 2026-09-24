import { AccountDelete, AccountDeleted } from '@noti/contracts';

// intent: product cleanup must succeed before identity removal; status: implemented.
// next: coordinator verifies the Rust transaction in the integrated checkout.
export class Accounts {
  constructor(private readonly secret: string, private readonly fetcher: typeof fetch = fetch) {}
  async delete(userId: string) {
    const response = await this.fetcher('http://127.0.0.1:3810/internal/accounts/delete', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2000),
      headers: { host: '127.0.0.1:3810', authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify(AccountDelete.parse({ user_id: userId })),
    });
    if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Product cleanup unavailable'); }
    const reader = response.body.getReader();
    let size = 0; const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 4096) throw new Error('Invalid cleanup response');
        chunks.push(part.value);
      }
      AccountDeleted.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } finally { await reader.cancel(); }
  }
}
