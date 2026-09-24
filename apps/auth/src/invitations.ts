import { InvitationCheck, InvitationRedeem, InvitationValid, Membership } from '@noti/contracts';
import { z } from 'zod';

export class InvitationError extends Error {
  constructor(readonly unavailable: boolean) { super(unavailable ? 'Invitation service unavailable' : 'Invitation invalid'); }
}
export class Invitations {
  constructor(private readonly secret: string, private readonly fetcher: typeof fetch = fetch) {}
  private async call(path: 'check' | 'redeem', body: unknown) {
    try {
      const response = await this.fetcher(`http://127.0.0.1:3810/internal/invitations/${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2000),
        headers: { authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new InvitationError(response.status >= 500);
      }
      if (!response.body) throw new InvitationError(true);
      const reader = response.body.getReader();
      let text = ''; let size = 0; const decoder = new TextDecoder();
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 4096) throw new InvitationError(true);
          text += decoder.decode(part.value, { stream: true });
        }
      } finally { await reader.cancel(); }
      return JSON.parse(text + decoder.decode()) as unknown;
    } catch (error) {
      if (error instanceof InvitationError) throw error;
      throw new InvitationError(true);
    }
  }
  async check(token: string, email: string) {
    const body = InvitationCheck.parse({ token, email: email.toLowerCase() });
    try { InvitationValid.parse(await this.call('check', body)); }
    catch (error) { if (error instanceof InvitationError) throw error; throw new InvitationError(true); }
  }
  async redeem(input: z.infer<typeof InvitationRedeem>) {
    const body = InvitationRedeem.parse(input);
    try { return Membership.parse(await this.call('redeem', body)); }
    catch (error) { if (error instanceof InvitationError) throw error; throw new InvitationError(true); }
  }
}

export const PendingInvitation = z.strictObject({ token: z.string().min(1).max(256), expiresAt: z.number().int().positive() });
export function invitationHeader(headers: Headers | undefined) {
  const raw = headers?.get('x-noti-invitation');
  if (raw === null || raw === undefined) return undefined;
  return z.string().min(1).max(256).parse(raw);
}
