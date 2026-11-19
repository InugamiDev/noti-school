import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';

// intent: what the account-page specs share: the synthetic demo server (password-only unless a test
// opts into passkeys, as the real service does with AUTH_PASSKEYS) and intercepted capability
// fixtures. Loopback only; no mail, OAuth, key or real account.
// status: done | next: none | confidence: high
const artifacts = fileURLToPath(new URL('./artifacts/', import.meta.url));
const demoScript = fileURLToPath(new URL('../../apps/web/scripts/demo-server.mjs', import.meta.url));
export const password = 'synthetic-passphrase-1';
export const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
export const stored = (page: Page) => page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
export const prepareArtifacts = async () => { await mkdir(artifacts, { recursive: true }); };
// The cold-load splash is a fixed overlay; a full-page picture is taken only after it has lifted.
export async function shot(page: Page, name: string) {
  await expect(page.locator('#splash')).toHaveCount(0);
  await page.screenshot({ path: `${artifacts}${name}.png`, fullPage: true });
}

// ---- Synthetic demo server: one fresh process per test, so accounts and passkeys never leak across tests.
export type Demo = { site: string; call: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: unknown }>; stop: () => void };
const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('No port'))));
  });
});
/** Starts the demo as it ships (password-only); `passkeys` is its DEMO_PASSKEYS opt-in. */
export async function startDemo(options: { passkeys?: boolean } = {}): Promise<Demo> {
  const port = await freePort();
  const { DEMO_PASSKEYS: _inherited, ...env } = process.env;
  const child: ChildProcess = spawn(process.execPath, [demoScript, String(port)], {
    env: { ...env, DEMO_ANSWER_DELAY_MS: '0', ...(options.passkeys ? { DEMO_PASSKEYS: 'true' } : {}) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Demo server exited early with ${code}`)));
    child.stdout!.once('data', () => resolve());
  });
  const call: Demo['call'] = async (method, path, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, json: await response.json() };
  };
  // WebAuthn needs a registrable name: the page is opened on localhost, never on the bare IP.
  return { site: `http://localhost:${port}`, call, stop: () => { child.kill(); } };
}

// ---- Intercepted fixtures: what the account page shows for each capability and reply shape.
const id = '11111111-1111-4111-8111-111111111111';
const on = { state: 'available', reason: 'ready' }, off = { state: 'disabled', reason: 'not_configured' };
export type Method = 'google' | 'email' | 'password' | 'passkey' | 'identity';
export type Fixture = {
  user: string | null;
  available: Method[];
  capabilitiesFail?: boolean;
  /** What sign-up answers with: a session at once, or an account that still has to sign in. */
  signUpSession?: boolean;
  passkeys?: { id: string; name?: string; createdAt: string }[];
  calls: { method: string; path: string; body: unknown; invitation: string | undefined }[];
};
export const failure = (code: string, message = 'Synthetic failure') => ({ error: { code, message, request_id: id, retryable: false } });
export async function fixture(page: Page, options: Omit<Fixture, 'calls'>) {
  const state: Fixture = { ...options, calls: [] };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
    const body: unknown = method === 'POST' ? request.postDataJSON() : undefined;
    if (path.startsWith('/api/auth/')) state.calls.push({ method, path: path.slice('/api/auth/'.length), body, invitation: request.headers()['x-noti-invitation'] });
    if (path.endsWith('/capabilities')) {
      if (state.capabilitiesFail) return route.fulfill({ status: 503, json: failure('core_unavailable') });
      const cap = (name: Method) => (state.available.includes(name) ? on : off);
      return route.fulfill({ json: { mode: 'mock', answers: on, indexing: on, discovery: on, google: cap('google'), email: cap('email'), password: cap('password'), passkey: cap('passkey'), identity: cap('identity') } });
    }
    if (path.endsWith('/institutions')) return route.fulfill({ json: { items: [{ id, slug: 'synthetic', name: 'Synthetic School', kind: 'school', domains: [], coverage: 'synthetic_demo' }], next_cursor: null } });
    if (path.endsWith('/api/v1/me')) {
      if (!state.user) return route.fulfill({ status: 401, json: failure('unauthenticated') });
      return route.fulfill({ json: { identity: { user_id: state.user, session_id: 'synthetic-session', email_verified: true, expires_at: '2027-01-01T00:00:00Z' }, memberships: [] } });
    }
    if (path.endsWith('/sign-up/email')) {
      if (state.signUpSession) state.user = 'synthetic-new-member';
      return route.fulfill({ json: { token: state.signUpSession ? 'synthetic-session-token' : null, user: { id: 'synthetic-new-member' } } });
    }
    if (path.endsWith('/sign-in/email')) { state.user = 'synthetic-new-member'; return route.fulfill({ json: { token: 'synthetic-session-token', user: { id: state.user } } }); }
    if (path.endsWith('/sign-out')) { state.user = null; return route.fulfill({ json: { success: true } }); }
    if (path.endsWith('/invitations/redeem')) return route.fulfill({ json: { institution_id: id, role: 'student' } });
    if (path.endsWith('/passkey/list-user-passkeys') && state.passkeys) return route.fulfill({ json: state.passkeys });
    if (path.endsWith('/passkey/delete-passkey') && state.passkeys) {
      state.passkeys = state.passkeys.filter((passkey) => passkey.id !== (body as { id: string }).id);
      return route.fulfill({ json: { status: true } });
    }
    return route.fulfill({ status: 503, json: failure('core_unavailable') });
  });
  return state;
}
export const passkeyButton = (page: Page) => page.getByRole('button', { name: 'Sign in with a passkey', exact: true });
export const googleButton = (page: Page) => page.getByRole('button', { name: 'Continue with Google', exact: true });
export const signInButton = (page: Page) => page.locator('form').getByRole('button', { name: 'Sign in', exact: true });
export const createLink = (page: Page) => page.getByRole('button', { name: 'Create account', exact: true });
