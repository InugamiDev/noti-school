import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';

// intent: password and passkey sign-in on the account page. Real WebAuthn ceremonies run in
// Chromium against a virtual authenticator (CDP) and the synthetic demo server on loopback; the
// capability and fallback cases use intercepted fixtures. No mail, OAuth, key or real account.
// status: done | next: the same journeys against the real auth worker belong to the coordinator
// confidence: medium (a passing demo server says nothing about the real identity service)
const artifacts = fileURLToPath(new URL('./artifacts/', import.meta.url));
const demoScript = fileURLToPath(new URL('../../apps/web/scripts/demo-server.mjs', import.meta.url));
const password = 'synthetic-passphrase-1';
const today = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date());
const noOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const stored = (page: Page) => page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
// The cold-load splash is a fixed overlay; a full-page picture is taken only after it has lifted.
async function shot(page: Page, name: string) {
  await expect(page.locator('#splash')).toHaveCount(0);
  await page.screenshot({ path: `${artifacts}${name}.png`, fullPage: true });
}

test.beforeAll(async () => { await mkdir(artifacts, { recursive: true }); });

// ---- Synthetic demo server: one fresh process per test, so accounts and passkeys never leak across tests.
type Demo = { site: string; call: (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: unknown }>; stop: () => void };
const freePort = () => new Promise<number>((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address();
    probe.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('No port'))));
  });
});
async function startDemo(): Promise<Demo> {
  const port = await freePort();
  const child: ChildProcess = spawn(process.execPath, [demoScript, String(port)], {
    env: { ...process.env, DEMO_ANSWER_DELAY_MS: '0' },
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
/** Chromium's virtual authenticator: an internal CTAP2 device with resident keys and user verification. */
async function virtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return {
    credentials: async () => (await client.send('WebAuthn.getCredentials', { authenticatorId })).credentials,
    // With presence simulated, the authenticator answers any waiting request by itself, including the
    // autofill request the sign-in form starts. A person has to pick a passkey there, so the tests
    // switch presence off while signed out and on again once they have pressed the button.
    presence: (enabled: boolean) => client.send('WebAuthn.setAutomaticPresenceSimulation', { authenticatorId, enabled }),
  };
}

test.describe('synthetic demo server with a virtual authenticator', () => {
  let demo: Demo;
  test.beforeEach(async ({ page }) => {
    demo = await startDemo();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    // The demo starts signed in as its demo student; these journeys start signed out.
    expect((await demo.call('POST', '/api/auth/sign-out', {})).status).toBe(200);
  });
  test.afterEach(() => { demo?.stop(); });
  const createAccount = async (email: string) => {
    const created = await demo.call('POST', '/api/auth/sign-up/email', { email, password, name: 'Synthetic' }, { 'x-noti-invitation': 'demo-invite' });
    expect(created.status).toBe(200);
    expect((await demo.call('POST', '/api/auth/invitations/redeem', { token: 'demo-invite' })).status).toBe(200);
  };

  test('an invitation link creates a password account with no email step, redeems the invitation and offers a passkey once', async ({ page }) => {
    const authenticator = await virtualAuthenticator(page);
    const requests: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/api/auth/')) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${demo.site}/#/auth?invitation=demo-invite`);
    await expect(page.locator('form h2')).toHaveText('Create account');
    // The token leaves the address at once and is never written to storage.
    expect(page.url()).not.toContain('demo-invite');
    await expect(page.getByText('Your invitation link is attached.', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Invitation token', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Name', { exact: true })).toHaveCount(0);
    const secret = page.getByLabel('Password', { exact: true });
    await expect(secret).toHaveAttribute('autocomplete', 'new-password');
    await expect(secret).toHaveAttribute('minlength', '12');
    await expect(secret).toHaveAttribute('maxlength', '128');
    await expect(page.getByText('Use 12 to 128 characters.')).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill('invited.student@example.edu');
    await secret.fill(password);
    // Show and hide the password from the keyboard.
    await expect(secret).toHaveAttribute('type', 'password');
    await secret.press('Tab');
    const reveal = page.getByRole('button', { name: 'Show password' });
    await expect(reveal).toBeFocused();
    await page.keyboard.press('Space');
    await expect(secret).toHaveAttribute('type', 'text');
    await expect(reveal).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Space');
    await expect(secret).toHaveAttribute('type', 'password');
    expect(await noOverflow(page)).toBe(true);

    const signUp = page.waitForRequest((request) => request.url().endsWith('/api/auth/sign-up/email'));
    const redeem = page.waitForRequest((request) => request.url().endsWith('/api/auth/invitations/redeem'));
    await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
    const sent = await signUp;
    expect(sent.headers()['x-noti-invitation']).toBe('demo-invite');
    expect(sent.postDataJSON()).toMatchObject({ email: 'invited.student@example.edu', password });
    expect((await redeem).postDataJSON()).toEqual({ token: 'demo-invite' });

    // Straight to the signed-in account: no "check your email" step, and nothing was mailed.
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Account created. You are signed in and your invitation is redeemed.');
    await expect(page.getByText(/verification link|check your email/i)).toHaveCount(0);
    expect(requests.some((entry) => entry.includes('send-verification-email'))).toBe(false);
    await expect(page.locator('.account-id')).toHaveText('demo-account-1');
    const memberships = page.getByRole('list', { name: 'Institution memberships' });
    await expect(memberships.getByRole('listitem')).toHaveCount(1);
    await expect(memberships).toContainText('Example University');
    await expect(memberships).toContainText('Student');
    expect(await stored(page)).not.toContain('demo-invite');
    expect(await stored(page)).not.toContain(password);

    // The passkey offer appears once, right after sign-up.
    const offer = page.getByRole('group', { name: 'Add a passkey for faster sign-in' });
    await expect(offer).toBeVisible();
    await expect(page.getByText('No passkeys yet.')).toBeVisible();
    await shot(page, 'passkey-offer-1440');
    await offer.getByRole('button', { name: 'Add a passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Passkey added. You can use it the next time you sign in.');
    await expect(offer).toHaveCount(0);
    const list = page.getByRole('list', { name: 'Your passkeys' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText(`Added ${today}`);
    expect(await authenticator.credentials()).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Add a passkey for faster sign-in' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add a passkey', exact: true })).toHaveCount(1);
    expect(await noOverflow(page)).toBe(true);
  });

  test('password sign-in refuses a wrong password in plain words and accepts the right one; reset says it needs email', async ({ page }) => {
    await createAccount('returning.student@example.edu');
    await demo.call('POST', '/api/auth/sign-out', {});
    await page.goto(`${demo.site}/#/auth`);
    await expect(page.locator('form h2')).toHaveText('Sign in');
    // The demo has no mail and no Google: neither a dead reset link nor a Google button is shown.
    await expect(page.getByText('Password reset needs email, which is not set up yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Resend verification email' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password');
    await page.getByLabel('Email', { exact: true }).fill('returning.student@example.edu');
    await page.getByLabel('Password', { exact: true }).fill('not-the-right-password');
    await page.getByLabel('Password', { exact: true }).press('Enter');
    await expect(page.getByRole('status')).toHaveText('Email or password is incorrect.');
    await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Signed in. Return to your question.');
    await expect(page.locator('.account-id')).toHaveText('demo-account-1');
    // A returning member is not shown the first-time offer.
    await expect(page.getByRole('group', { name: 'Add a passkey for faster sign-in' })).toHaveCount(0);
    // Deletion needs mail too: a line, not a dead button.
    await page.getByText('Delete account', { exact: true }).click();
    await expect(page.getByText('Account deletion needs email, which is not set up yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: /account deletion/ })).toHaveCount(0);
    expect(await stored(page)).not.toContain(password);
  });

  test('passkey: add with a name, list, sign in with it, remove it, and a removed passkey no longer signs in', async ({ page }) => {
    const authenticator = await virtualAuthenticator(page);
    await createAccount('passkey.student@example.edu');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${demo.site}/#/auth`);
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Passkeys' })).toBeVisible();
    await expect(page.getByText('No passkeys yet.')).toBeVisible();

    // Add, by keyboard: type a name and press Enter.
    await page.getByLabel('Passkey name (optional)').fill('Synthetic laptop');
    await page.getByLabel('Passkey name (optional)').press('Enter');
    await expect(page.getByRole('status')).toHaveText('Passkey added. You can use it the next time you sign in.');
    await expect(page.getByRole('status')).toHaveAttribute('data-tone', 'done');
    const list = page.getByRole('list', { name: 'Your passkeys' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Synthetic laptop');
    await expect(list).toContainText(`Added ${today}`);
    await expect(page.getByLabel('Passkey name (optional)')).toHaveValue('');
    expect(await authenticator.credentials()).toHaveLength(1);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'passkeys-1440');

    // The same authenticator cannot hold a second passkey for the account; that is said plainly.
    await page.getByRole('button', { name: 'Add a passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('This device already has a passkey for your account.');
    await expect(list.getByRole('listitem')).toHaveCount(1);

    // Sign out, then sign in with the passkey: a normal session for the same existing account.
    await authenticator.presence(false);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Signed out.');
    await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'username webauthn');
    const verified = page.waitForResponse((response) => response.url().endsWith('/api/auth/passkey/verify-authentication'));
    await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
    await authenticator.presence(true);
    expect((await verified).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.locator('.account-id')).toHaveText('demo-account-1');
    await expect(page.getByRole('list', { name: 'Institution memberships' }).getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Synthetic laptop');

    // Remove asks first, with the safe choice focused.
    await page.getByRole('button', { name: 'Remove passkey: Synthetic laptop' }).click();
    await expect(page.getByRole('button', { name: 'Keep', exact: true })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove passkey: Synthetic laptop' }).click();
    await page.getByRole('button', { name: 'Remove passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Passkey removed.');
    await expect(page.getByText('No passkeys yet.')).toBeVisible();
    await expect(list).toHaveCount(0);

    // The authenticator still holds the credential, but the account no longer accepts it.
    expect(await authenticator.credentials()).toHaveLength(1);
    await authenticator.presence(false);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
    await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
    await authenticator.presence(true);
    await expect(page.getByRole('status')).toContainText('That passkey is not registered with a noti.school account.');
    await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
    expect((await demo.call('GET', '/api/v1/me')).status).toBe(401);
  });

  test('a passkey offered from the email field (autofill) signs in the account it belongs to', async ({ page }) => {
    await virtualAuthenticator(page);
    await createAccount('autofill.student@example.edu');
    await page.goto(`${demo.site}/#/auth`);
    await page.getByRole('button', { name: 'Add a passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Passkey added. You can use it the next time you sign in.');
    // Signed out, the form quietly asks for a passkey through the email field. The virtual
    // authenticator answers that request by itself, which stands in for the visitor picking the
    // passkey from the field: no passkey button is pressed in this test.
    const signedOut = page.waitForResponse((response) => response.url().endsWith('/api/auth/sign-out'));
    const offered = page.waitForRequest((request) => request.url().endsWith('/api/auth/passkey/generate-authenticate-options'));
    const verified = page.waitForResponse((response) => response.url().endsWith('/api/auth/passkey/verify-authentication'));
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    expect((await signedOut).status()).toBe(200);
    expect((await offered).method()).toBe('GET');
    expect((await verified).status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Signed in. Return to your question.');
    await expect(page.locator('.account-id')).toHaveText('demo-account-1');
  });

  test('a passkey prompt that ends without a passkey leaves the visitor signed out, calmly; adding one needs a session', async ({ page }) => {
    await virtualAuthenticator(page);
    await page.goto(`${demo.site}/#/auth`);
    // Nothing is registered on this authenticator. The prompt ending is stood in for here, because a
    // real one would wait for its timeout.
    await page.evaluate(() => {
      navigator.credentials.get = () => Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
    });
    await page.getByRole('button', { name: 'Sign in with a passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Passkey sign-in was not completed. You can try again or use your password.');
    await expect(page.getByRole('status')).toHaveAttribute('data-tone', 'calm');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
    expect((await demo.call('GET', '/api/v1/me')).status).toBe(401);
    // Registration needs a session: signed out, the server gives no options at all.
    expect((await demo.call('GET', '/api/auth/passkey/generate-register-options')).status).toBe(401);
    expect((await demo.call('GET', '/api/auth/passkey/list-user-passkeys')).status).toBe(401);
  });

  test('a dismissed passkey prompt while adding is reported calmly and changes nothing', async ({ page }) => {
    await virtualAuthenticator(page);
    await createAccount('cautious.student@example.edu');
    await page.goto(`${demo.site}/#/auth`);
    await expect(page.getByText('No passkeys yet.')).toBeVisible();
    await page.evaluate(() => {
      navigator.credentials.create = () => Promise.reject(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'));
    });
    await page.getByRole('button', { name: 'Add a passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('No passkey was added. You can try again whenever you like.');
    await expect(page.getByRole('status')).toHaveAttribute('data-tone', 'calm');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText('No passkeys yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a passkey', exact: true })).toBeEnabled();
  });

  test('Vietnamese at 390x844: invited sign-up, passkey add, passkey sign-in and removal fit the phone', async ({ page }) => {
    const authenticator = await virtualAuthenticator(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${demo.site}/#/auth?invitation=demo-invite`);
    await page.getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Tiếng Việt' }).click();
    await expect(page.locator('section.auth')).toHaveAttribute('lang', 'vi');
    await expect(page.getByRole('heading', { name: 'Chào mừng đến với noti.school' })).toBeVisible();
    await expect(page.locator('form h2')).toHaveText('Tạo tài khoản');
    await expect(page.getByText('Dùng từ 12 đến 128 ký tự.')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'passkey-signup-vi-390');
    await page.getByLabel('Email', { exact: true }).fill('sinh.vien@example.edu');
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.locator('form').getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Tài khoản của bạn' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Đã tạo tài khoản. Bạn đã đăng nhập và lời mời đã được dùng.');
    const offer = page.getByRole('group', { name: 'Thêm passkey để đăng nhập nhanh hơn' });
    await expect(offer).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await offer.getByRole('button', { name: 'Để sau' }).click();
    await expect(offer).toHaveCount(0);
    await page.getByLabel('Tên passkey (không bắt buộc)').fill('Điện thoại thử nghiệm của tôi, một cái tên khá dài để kiểm tra bố cục');
    await page.getByRole('button', { name: 'Thêm passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Đã thêm passkey. Bạn có thể dùng passkey này ở lần đăng nhập sau.');
    const list = page.getByRole('list', { name: 'Passkey của bạn' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list).toContainText('Thêm ngày');
    expect(await authenticator.credentials()).toHaveLength(1);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'passkeys-vi-390');

    await authenticator.presence(false);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Đã đăng xuất.');
    await expect(page.getByText('Đặt lại mật khẩu cần email, hiện chưa được thiết lập.')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'passkey-signin-vi-390');
    await page.getByRole('button', { name: 'Đăng nhập bằng passkey', exact: true }).click();
    await authenticator.presence(true);
    await expect(page.getByRole('heading', { name: 'Tài khoản của bạn' })).toBeVisible();
    await page.getByRole('button', { name: /^Xóa passkey: Điện thoại/ }).click();
    await expect(page.getByText('Xóa passkey này? Bạn sẽ không còn đăng nhập được bằng passkey đó.')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await page.getByRole('button', { name: 'Xóa passkey', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Đã xóa passkey.');
    await expect(page.getByText('Bạn chưa có passkey nào.')).toBeVisible();
    await page.getByText('Xóa tài khoản', { exact: true }).click();
    await expect(page.getByText('Xóa tài khoản cần email, hiện chưa được thiết lập.')).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  });
});

// ---- Intercepted fixtures: what the account page shows for each capability and reply shape.
const id = '11111111-1111-4111-8111-111111111111';
const on = { state: 'available', reason: 'ready' }, off = { state: 'disabled', reason: 'not_configured' };
type Method = 'google' | 'email' | 'password' | 'passkey' | 'identity';
type Fixture = {
  user: string | null;
  available: Method[];
  capabilitiesFail?: boolean;
  /** What sign-up answers with: a session at once, or an account that still has to sign in. */
  signUpSession?: boolean;
  passkeys?: { id: string; name?: string; createdAt: string }[];
  calls: { method: string; path: string; body: unknown; invitation: string | undefined }[];
};
const failure = (code: string, message = 'Synthetic failure') => ({ error: { code, message, request_id: id, retryable: false } });
async function fixture(page: Page, options: Omit<Fixture, 'calls'>) {
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
const passkeyButton = (page: Page) => page.getByRole('button', { name: 'Sign in with a passkey', exact: true });
const googleButton = (page: Page) => page.getByRole('button', { name: 'Continue with Google', exact: true });
const signInButton = (page: Page) => page.locator('form').getByRole('button', { name: 'Sign in', exact: true });
const createLink = (page: Page) => page.getByRole('button', { name: 'Create account', exact: true });

test('the sign-in screen offers exactly the methods the server reports as available', async ({ page }) => {
  const state = await fixture(page, { user: null, available: ['identity', 'google', 'email', 'password', 'passkey'] });
  await page.goto('/#/auth');
  await expect(signInButton(page)).toBeEnabled();
  await expect(googleButton(page)).toBeVisible();
  await expect(passkeyButton(page)).toBeVisible();
  await expect(page.getByText('or with email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toBeVisible();
  await expect(createLink(page)).toBeVisible();
  await expect(page.getByText('Password reset needs email', { exact: false })).toHaveCount(0);

  // Password only, no mail: the form stays, the mail-dependent paths become one calm line.
  state.available = ['identity', 'password'];
  await page.reload();
  await expect(signInButton(page)).toBeEnabled();
  await expect(googleButton(page)).toHaveCount(0);
  await expect(passkeyButton(page)).toHaveCount(0);
  await expect(page.getByText('or with email')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Resend verification email' })).toHaveCount(0);
  await expect(page.getByText('Password reset needs email, which is not set up yet.')).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'email');
  await expect(createLink(page)).toBeVisible();

  // Passkey only: no password form, and one line says why an account cannot be created.
  state.available = ['identity', 'passkey'];
  await page.reload();
  await expect(passkeyButton(page)).toBeVisible();
  await expect(signInButton(page)).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(googleButton(page)).toHaveCount(0);
  await expect(createLink(page)).toHaveCount(0);
  await expect(page.getByText('New accounts cannot be created yet, because password sign-up is not set up.')).toBeVisible();
  await expect(page.getByText('or with email')).toHaveCount(0);

  // Google only.
  state.available = ['identity', 'google'];
  await page.reload();
  await expect(googleButton(page)).toBeEnabled();
  await expect(passkeyButton(page)).toHaveCount(0);
  await expect(signInButton(page)).toHaveCount(0);
  await expect(page.getByText('New accounts cannot be created yet, because password sign-up is not set up.')).toBeVisible();

  // Identity is up but no method is configured.
  state.available = ['identity'];
  await page.reload();
  await expect(page.getByText('No sign-in method is set up yet.', { exact: false })).toBeVisible();
  for (const control of [googleButton(page), passkeyButton(page), signInButton(page), createLink(page)]) await expect(control).toHaveCount(0);

  // A method is never offered while identity itself is not available, or when the read failed.
  state.available = ['google', 'email', 'password', 'passkey'];
  await page.reload();
  await expect(page.getByText('Sign-in availability is not confirmed.', { exact: false })).toBeVisible();
  for (const control of [googleButton(page), passkeyButton(page), signInButton(page), createLink(page)]) await expect(control).toHaveCount(0);
  state.capabilitiesFail = true;
  await page.reload();
  await expect(page.getByText('Sign-in availability is not confirmed.', { exact: false })).toBeVisible();
  for (const control of [googleButton(page), passkeyButton(page), signInButton(page), createLink(page)]) await expect(control).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);
});

test('an invitation link without password sign-up says so in one line and keeps the invitation out of the address', async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'passkey'] });
  await page.goto('/#/auth?invitation=synthetic-invite');
  expect(page.url()).not.toContain('synthetic-invite');
  await expect(page.getByText('New accounts cannot be created yet, because password sign-up is not set up. Your invitation is kept for this visit.')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(passkeyButton(page)).toBeVisible();
  expect(await stored(page)).not.toContain('synthetic-invite');
});

for (const mail of [false, true]) test(`sign-up that returns no session goes to sign-in with the email filled in (${mail ? 'mail configured: verify first' : 'no mail'})`, async ({ page }) => {
  const state = await fixture(page, { user: null, available: mail ? ['identity', 'password', 'email'] : ['identity', 'password'], signUpSession: false });
  await page.goto('/?invitation=synthetic-invite#/auth');
  expect(page.url()).not.toContain('synthetic-invite');
  await expect(page.locator('form h2')).toHaveText('Create account');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.locator('form h2')).toHaveText('Sign in');
  await expect(page.getByRole('status')).toHaveText(mail
    ? 'Account created. Open the verification link sent to your email, then sign in.'
    : 'Account created. Sign in to continue.');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('synthetic@example.test');
  expect(state.calls.find((call) => call.path === 'sign-up/email')?.invitation).toBe('synthetic-invite');
  // Nothing was redeemed without a session.
  expect(state.calls.some((call) => call.path === 'invitations/redeem')).toBe(false);

  // Signing in then redeems the invitation that was waiting, as the invitation form would.
  await page.getByLabel('Password', { exact: true }).fill(password);
  await signInButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Signed in and invitation redeemed. Your new institution is selected.');
  expect(state.calls.filter((call) => call.path === 'invitations/redeem').map((call) => call.body)).toEqual([{ token: 'synthetic-invite' }]);
  expect(await stored(page)).not.toContain('synthetic-invite');
  expect(await stored(page)).not.toContain(password);
});

test('sign-up that returns a session redeems the invitation right away', async ({ page }) => {
  const state = await fixture(page, { user: null, available: ['identity', 'password'], signUpSession: true });
  await page.goto('/#/auth?invitation=synthetic-invite');
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Account created. You are signed in and your invitation is redeemed.');
  const order = state.calls.map((call) => call.path).filter((path) => ['sign-up/email', 'invitations/redeem'].includes(path));
  expect(order).toEqual(['sign-up/email', 'invitations/redeem']);
  expect(state.calls.some((call) => call.path === 'sign-in/email')).toBe(false);
});

test('a refused invitation is explained and the typed token is not kept', async ({ page }) => {
  const state = await fixture(page, { user: null, available: ['identity', 'password'] });
  await page.route('**/api/auth/sign-up/email', (route) => route.fulfill({ status: 403, json: failure('forbidden') }));
  await page.goto('/#/auth');
  await createLink(page).click();
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Invitation token', { exact: true }).fill('synthetic-wrong-invite');
  await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('This invitation does not match that email, or it has expired or already been used.');
  await expect(page.getByRole('status')).toHaveAttribute('data-tone', 'problem');
  await expect(page.locator('form h2')).toHaveText('Create account');
  expect(state.calls.some((call) => call.path === 'invitations/redeem')).toBe(false);
  expect(await stored(page)).not.toContain('synthetic-wrong-invite');
});

for (const missing of ['WebAuthn', 'the WebAuthn JSON helpers']) test(`passkey controls are hidden, without any warning, when the browser lacks ${missing}`, async ({ page }) => {
  await page.addInitScript((everything) => {
    if (everything) Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true });
    else Object.defineProperty(PublicKeyCredential, 'parseRequestOptionsFromJSON', { value: undefined, configurable: true });
  }, missing === 'WebAuthn');
  const state = await fixture(page, { user: null, available: ['identity', 'password', 'passkey'], passkeys: [{ id: 'synthetic-passkey', name: 'Synthetic phone', createdAt: '2026-11-02T03:00:00.000Z' }] });
  await page.goto('/#/auth');
  await expect(signInButton(page)).toBeEnabled();
  await expect(passkeyButton(page)).toHaveCount(0);
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText(/passkey/i)).toHaveCount(0);
  expect(state.calls.some((call) => call.path.startsWith('passkey/'))).toBe(false);

  // Signed in, an existing passkey can still be removed; adding one is not offered.
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await signInButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  const list = page.getByRole('list', { name: 'Your passkeys' });
  await expect(list).toContainText('Synthetic phone');
  await expect(list).toContainText('Added 2 Nov 2026');
  await expect(page.getByRole('button', { name: 'Add a passkey', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Passkey name (optional)')).toHaveCount(0);
  await expect(page.getByText('This browser cannot add passkeys.')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove passkey: Synthetic phone' }).click();
  await page.getByRole('button', { name: 'Remove passkey', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Passkey removed.');
  await expect(page.getByText('No passkeys yet.')).toBeVisible();
});

test('the account page has no passkey area when the server does not offer passkeys', async ({ page }) => {
  const state = await fixture(page, { user: 'synthetic-member', available: ['identity', 'password', 'email'] });
  await page.goto('/#/auth');
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Passkeys' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a passkey', exact: true })).toHaveCount(0);
  expect(state.calls.some((call) => call.path.startsWith('passkey/'))).toBe(false);
  // With mail available, deletion is offered as before.
  await page.getByText('Delete account', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Request account deletion' })).toBeEnabled();
});

test('a signed-in member who opens an invitation link gets the token ready to redeem', async ({ page }) => {
  const state = await fixture(page, { user: 'synthetic-member', available: ['identity', 'password'] });
  await page.goto('/#/auth?invitation=synthetic-second-invite');
  expect(page.url()).not.toContain('synthetic-second-invite');
  await expect(page.locator('form h2')).toHaveText('Redeem invitation');
  await expect(page.getByLabel('Invitation token', { exact: true })).toHaveValue('synthetic-second-invite');
  await page.locator('form').getByRole('button', { name: 'Redeem invitation', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Invitation redeemed.');
  expect(state.calls.filter((call) => call.path === 'invitations/redeem').map((call) => call.body)).toEqual([{ token: 'synthetic-second-invite' }]);
  await expect(page.getByLabel('Invitation token', { exact: true })).toHaveValue('');
});

test('the sign-in screen reads in Vietnamese and fits 390x844 and 1440x900', async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'google', 'email', 'password', 'passkey'] });
  for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    await page.goto('/#/auth');
    await page.getByRole('group', { name: /^(Language|Ngôn ngữ)$/ }).getByRole('button', { name: 'Tiếng Việt' }).click();
    await expect(page.getByRole('group', { name: 'Ngôn ngữ' }).getByRole('button', { name: 'Tiếng Việt' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Tiếp tục với Google', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng passkey', exact: true })).toBeVisible();
    await expect(page.getByText('hoặc bằng email')).toBeVisible();
    await expect(page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Quên mật khẩu?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hiện mật khẩu' })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await shot(page, `signin-vi-${size.width}`);
    await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
    await expect(page.locator('form h2')).toHaveText('Tạo tài khoản');
    await expect(page.getByLabel('Mã mời', { exact: true })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    // The choice is shared with the rest of the app and survives a reload in this tab.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Chào mừng đến với noti.school' })).toBeVisible();
    await page.getByRole('group', { name: 'Ngôn ngữ' }).getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to noti.school' })).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
  }
});
