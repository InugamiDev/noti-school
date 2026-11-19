import { test, expect, type Locator, type Page } from '../../apps/web/node_modules/@playwright/test/index.mjs';
import { createLink, fixture, googleButton, noOverflow, passkeyButton, password, prepareArtifacts, shot, signInButton, startDemo, stored, type Demo } from './auth-fixtures';

// intent: the pilot's password-only sign-in (owner decision, 19 Nov 2026) and the redesigned account
// card. With the passkey capability off nothing about passkeys may render or be requested, in a
// browser that could use them. Covers the invitation create mode, the header, Vietnamese copy, the
// 390px layout and contrast on the glass card. Intercepted fixtures plus the synthetic demo server in
// its default mode, on loopback; no mail, OAuth, key or real account.
// status: done | next: the same journeys against the real auth worker belong to the coordinator
// confidence: medium (a passing mock says nothing about the real identity service)
test.beforeAll(prepareArtifacts);

const invitationLink = '/#/auth?invitation=synthetic-invite';
const card = (page: Page) => page.locator('.auth-card');
const intro = (page: Page) => page.locator('.auth-intro');
const emailField = (page: Page) => page.getByLabel('Email', { exact: true });
const secretField = (page: Page) => page.getByLabel('Password', { exact: true });
const lengthRule = (page: Page) => page.locator('.auth-rule');
const box = async (locator: Locator) => {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('Not rendered');
  return rect;
};
const passkeyCalls = (calls: { path: string }[]) => calls.filter((call) => call.path.startsWith('passkey/'));
/**
 * Counts WebAuthn requests and says the browser can offer passkeys from a field, so the checks
 * below hold because the capability is off and not because the test browser lacks the feature.
 */
async function watchWebAuthn(page: Page) {
  await page.addInitScript(() => {
    const seen = { get: 0 };
    Object.assign(window, { __webauthnSeen: seen });
    Object.defineProperty(PublicKeyCredential, 'isConditionalMediationAvailable', { value: () => Promise.resolve(true), configurable: true });
    navigator.credentials.get = () => {
      seen.get += 1;
      return Promise.reject(new DOMException('Synthetic: no authenticator.', 'NotAllowedError'));
    };
  });
  return () => page.evaluate(() => (window as unknown as { __webauthnSeen: { get: number } }).__webauthnSeen.get);
}
/** Relative luminance of the darkest pixel drawn inside the locator's box, `inset` pixels in from its edges. */
async function darkest(page: Page, locator: Locator, inset: number) {
  const rect = await box(locator);
  const clip = { x: rect.x + inset, y: rect.y + inset, width: rect.width - 2 * inset, height: rect.height - 2 * inset };
  const png = (await page.screenshot({ clip })).toString('base64');
  return page.evaluate(async (data) => {
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const linear = (value: number) => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
    let lowest = 1;
    for (let i = 0; i < pixels.length; i += 4)
      lowest = Math.min(lowest, 0.2126 * linear(pixels[i]!) + 0.7152 * linear(pixels[i + 1]!) + 0.0722 * linear(pixels[i + 2]!));
    return lowest;
  }, png);
}
/** The tab regains focus: the app reads the session again in the background. */
async function sessionReread(page: Page) {
  const reread = page.waitForResponse((response) => response.url().endsWith('/api/v1/me'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await reread;
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
const luminance = (hex: string) => {
  const linear = (value: number) => (value / 255 <= 0.03928 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
};

test('password-only sign-in: email, password and Sign in, with no passkey button, divider or autofill request', async ({ page }) => {
  const webauthnRequests = await watchWebAuthn(page);
  const state = await fixture(page, { user: null, available: ['identity', 'password', 'passkey'] });
  await page.setViewportSize({ width: 1280, height: 800 });

  // Control: this browser would use passkeys. With the capability on, the button is there and the
  // sign-in form quietly asks for a passkey through the email field.
  await page.goto('/#/auth');
  await expect(passkeyButton(page)).toBeVisible();
  await expect(emailField(page)).toHaveAttribute('autocomplete', 'username webauthn');
  await expect.poll(() => passkeyCalls(state.calls).map((call) => call.path)).toContain('passkey/generate-authenticate-options');

  // The pilot: the server reports passkeys as disabled.
  state.available = ['identity', 'password'];
  state.calls.length = 0;
  await page.reload();
  await expect(page.locator('form h2')).toHaveText('Sign in');
  await expect(signInButton(page)).toBeEnabled();
  await expect(emailField(page)).toHaveAttribute('type', 'email');
  await expect(emailField(page)).toHaveAttribute('autocomplete', 'email');
  await expect(secretField(page)).toHaveAttribute('autocomplete', 'current-password');
  await expect(passkeyButton(page)).toHaveCount(0);
  await expect(googleButton(page)).toHaveCount(0);
  await expect(page.getByText('or with email')).toHaveCount(0);
  await expect(page.locator('.auth-divider')).toHaveCount(0);
  await expect(page.getByText(/passkey/i)).toHaveCount(0);
  // One quiet line where the reset link would be, and no length rule on a sign-in.
  await expect(page.getByText('Password reset is not available yet.')).toBeVisible();
  await expect(page.getByText('Password reset needs email', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Forgot password?' })).toHaveCount(0);
  await expect(lengthRule(page)).toHaveCount(0);
  await expect(page.getByText('New to noti.school?')).toBeVisible();
  await expect(createLink(page)).toBeVisible();
  // Only the card's own controls: language, show password, sign in, create account.
  await expect(card(page).getByRole('button')).toHaveCount(5);
  expect(await noOverflow(page)).toBe(true);
  await shot(page, 'signin-password-only-1280');

  // Signing in asks for no passkey either, and the account has no passkey section.
  await emailField(page).fill('synthetic@example.test');
  await secretField(page).fill(password);
  await signInButton(page).click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Signed in. Return to your question.');
  await expect(page.getByRole('heading', { name: 'Passkeys' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a passkey', exact: true })).toHaveCount(0);
  await expect(page.getByText(/passkey/i)).toHaveCount(0);
  expect(passkeyCalls(state.calls)).toEqual([]);
  expect(await webauthnRequests()).toBe(0);
});

test('without password sign-up the screen does not offer "Create account"', async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'google'] });
  await page.goto('/#/auth');
  await expect(googleButton(page)).toBeVisible();
  await expect(createLink(page)).toHaveCount(0);
  await expect(page.getByText('New to noti.school?')).toHaveCount(0);
  await expect(passkeyButton(page)).toHaveCount(0);
});

test('an invitation link opens "Accept your invitation": chip above the fields, no top back link, live length line', async ({ page }) => {
  const webauthnRequests = await watchWebAuthn(page);
  const state = await fixture(page, { user: null, available: ['identity', 'password'], signUpSession: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(invitationLink);
  await expect(page.locator('form h2')).toHaveText('Accept your invitation');
  await expect(page.getByText('Create a password for the email address your invitation was sent to.')).toBeVisible();
  expect(page.url()).not.toContain('synthetic-invite');
  // The way back is the line under the form, not a link above it.
  await expect(page.getByRole('button', { name: 'Back to sign in' })).toHaveCount(0);
  await expect(page.getByText('Already have an account?')).toBeVisible();

  // The invitation is a small confirmed chip above the fields, with a quiet way to replace it.
  const chip = page.locator('.auth-chip');
  await expect(chip).toHaveText('Invitation attached');
  await expect(chip.locator('svg')).toHaveCount(1);
  const other = page.getByRole('button', { name: 'Use a different invitation', exact: true });
  await expect(other).toBeVisible();
  const [chipBox, otherBox, emailBox, secretBox] = await Promise.all([box(chip), box(other), box(emailField(page)), box(secretField(page))]);
  expect(chipBox.y + chipBox.height).toBeLessThanOrEqual(emailBox.y);
  expect(otherBox.y + otherBox.height).toBeLessThanOrEqual(emailBox.y);
  expect(emailBox.y).toBeLessThan(secretBox.y);
  expect(chipBox.height).toBeLessThanOrEqual(40);
  await expect(page.getByLabel('Invitation token', { exact: true })).toHaveCount(0);

  // Email: the right keyboard and autofill, focused, and no invented address.
  const email = emailField(page);
  await expect(email).toHaveAttribute('type', 'email');
  await expect(email).toHaveAttribute('autocomplete', 'email');
  await expect(email).toBeFocused();
  await expect(email).toHaveValue('');
  await expect(email).toHaveAccessibleDescription('Use the address the invitation was sent to.');
  await expect(page.getByText('Use the address the invitation was sent to.')).toBeVisible();

  // Password: the length line follows what is typed, in words and icon, and is announced politely.
  const secret = secretField(page), rule = lengthRule(page);
  await expect(secret).toHaveAttribute('autocomplete', 'new-password');
  await expect(secret).toHaveAttribute('minlength', '12');
  await expect(secret).toHaveAttribute('maxlength', '128');
  await expect(rule).toHaveAttribute('aria-live', 'polite');
  await expect(rule).toHaveAttribute('data-met', 'false');
  await expect(rule).toHaveText('Use 12 to 128 characters.');
  await expect(secret).toHaveAccessibleDescription('Use 12 to 128 characters.');
  const unmetIcon = await rule.locator('svg').innerHTML();
  await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible();
  await shot(page, 'invitation-create-1280');
  await email.fill('invited.student@example.test');
  await secret.pressSequentially('elevenchars');
  await expect(rule).toHaveAttribute('data-met', 'false');
  // A background re-read of the session (the tab regaining focus) leaves the caret where it is
  // and what was typed in place.
  await sessionReread(page);
  await expect(secret).toBeFocused();
  await expect(email).toHaveValue('invited.student@example.test');
  await expect(secret).toHaveValue('elevenchars');
  // A short password never disables the button: the field's own minlength is the only client check.
  const submit = page.locator('form').getByRole('button', { name: 'Create account', exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  expect(await secret.evaluate((field: HTMLInputElement) => field.validity.tooShort)).toBe(true);
  expect(state.calls.some((call) => call.path === 'sign-up/email')).toBe(false);
  await secret.pressSequentially('!');
  await expect(rule).toHaveAttribute('data-met', 'true');
  await expect(rule).toHaveText('Length is good (12 to 128 characters).');
  await expect(secret).toHaveAccessibleDescription('Length is good (12 to 128 characters).');
  expect(await rule.locator('svg').innerHTML()).not.toBe(unmetIcon);
  await secret.press('Backspace');
  await expect(rule).toHaveAttribute('data-met', 'false');
  await expect(rule).toHaveText('Use 12 to 128 characters.');
  await secret.fill(password);
  await expect(rule).toHaveAttribute('data-met', 'true');
  expect(await noOverflow(page)).toBe(true);

  // Creating the account sends the invitation, and nothing afterwards offers a passkey.
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Account created. You are signed in and your invitation is redeemed.');
  expect(state.calls.find((call) => call.path === 'sign-up/email')?.invitation).toBe('synthetic-invite');
  await expect(page.getByRole('group', { name: 'Add a passkey for faster sign-in' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Passkeys' })).toHaveCount(0);
  await expect(page.getByText(/passkey/i)).toHaveCount(0);
  expect(passkeyCalls(state.calls)).toEqual([]);
  expect(await webauthnRequests()).toBe(0);
  expect(await stored(page)).not.toContain('synthetic-invite');
  expect(await stored(page)).not.toContain(password);
});

test('"Use a different invitation" swaps the chip for the token field; the line under the form leads back to sign-in', async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'password'] });
  await page.goto(invitationLink);
  await expect(page.locator('form h2')).toHaveText('Accept your invitation');
  await page.getByRole('button', { name: 'Use a different invitation', exact: true }).click();
  await expect(page.locator('.auth-chip')).toHaveCount(0);
  await expect(page.locator('form h2')).toHaveText('Create account');
  await expect(page.getByText('New accounts need an invitation token from your institution.')).toBeVisible();
  const token = page.getByLabel('Invitation token', { exact: true });
  await expect(token).toBeFocused();
  await expect(token).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Back to sign in' })).toHaveCount(0);
  // A typed token survives the tab losing and regaining focus.
  await token.fill('synthetic-typed-invite');
  await sessionReread(page);
  await expect(token).toHaveValue('synthetic-typed-invite');

  await page.locator('.auth-switch').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('form h2')).toHaveText('Sign in');
  await expect(page.getByText('Use the address the invitation was sent to.')).toHaveCount(0);
  // So does an email typed on the sign-in form.
  await emailField(page).fill('returning@example.test');
  await sessionReread(page);
  await expect(emailField(page)).toHaveValue('returning@example.test');
  // Back in create mode from the sign-in form: the email field has focus again, with nothing moving.
  await createLink(page).click();
  await expect(page.locator('form h2')).toHaveText('Create account');
  await expect(emailField(page)).toBeFocused();
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => {
    const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
    return !!target?.closest('.auth');
  }).length)).toBe(0);
});

test('the header drops its "Sign in" pill on the account page while signed out; Sources and History stay', async ({ page }) => {
  const state = await fixture(page, { user: null, available: ['identity', 'password'] });
  const header = page.locator('header.site-header');
  await page.goto('/');
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await header.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('form h2')).toHaveText('Sign in');
  await expect(header.locator('.site-account')).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Sources', exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: 'History', exact: true })).toBeVisible();
  // The pill returns on every other page, and reads "Account" once signed in.
  await header.getByRole('link', { name: 'Sources', exact: true }).click();
  await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  state.user = 'synthetic-member';
  await page.goto('/#/auth');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Account', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('the brand column is short, and mentions the question draft only while one is waiting', async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'password'] });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/#/auth');
  await expect(page.getByRole('heading', { level: 1, name: 'Welcome to noti.school' })).toBeVisible();
  await expect(intro(page).locator('p')).toHaveText(['Sign in to ask your university questions.']);
  await expect(intro(page).getByRole('listitem')).toHaveText([
    'The pilot is for HCMIU students, by invitation.',
    'Answers cite the original document and page.',
  ]);
  await expect(page.getByText('Your question draft is kept in this tab.')).toHaveCount(0);
  // The pill sits on the heading's left edge, above it; the language switch lives in the card.
  const [badge, heading] = await Promise.all([box(page.locator('.auth-badge')), box(intro(page).locator('h1'))]);
  expect(Math.abs(badge.x - heading.x)).toBeLessThanOrEqual(1);
  expect(badge.y + badge.height).toBeLessThanOrEqual(heading.y);
  await expect(page.getByRole('group', { name: 'Language' })).toHaveCount(1);
  await expect(card(page).getByRole('group', { name: 'Language' })).toBeVisible();
  await expect(intro(page).getByRole('button')).toHaveCount(0);

  await page.goto('/');
  await page.getByRole('textbox', { name: /^(Your question|Câu hỏi của bạn)$/ }).fill('Where is the registrar?');
  await page.locator('header.site-header').getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(intro(page).getByRole('listitem')).toHaveText([
    'The pilot is for HCMIU students, by invitation.',
    'Answers cite the original document and page.',
    'Your question draft is kept in this tab.',
  ]);
});

test('Vietnamese: every new line of the sign-in and invitation screens reads in Vietnamese', async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'password'] });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(invitationLink);
  await card(page).getByRole('group', { name: 'Language' }).getByRole('button', { name: 'Tiếng Việt' }).click();
  await expect(page.locator('section.auth')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('heading', { level: 1, name: 'Chào mừng đến với noti.school' })).toBeVisible();
  await expect(intro(page).locator('p')).toHaveText(['Đăng nhập để đặt câu hỏi về trường của bạn.']);
  await expect(intro(page).getByRole('listitem')).toHaveText([
    'Chương trình thử nghiệm dành cho sinh viên HCMIU, theo lời mời.',
    'Câu trả lời trích dẫn tài liệu gốc và số trang.',
  ]);
  await expect(page.locator('form h2')).toHaveText('Chấp nhận lời mời của bạn');
  await expect(page.getByText('Hãy tạo mật khẩu cho địa chỉ email đã nhận lời mời.')).toBeVisible();
  await expect(page.locator('.auth-chip')).toHaveText('Đã đính kèm lời mời');
  await expect(page.getByRole('button', { name: 'Dùng lời mời khác', exact: true })).toBeVisible();
  await expect(emailField(page)).toHaveAccessibleDescription('Hãy dùng đúng địa chỉ đã nhận lời mời.');
  const secret = page.getByLabel('Mật khẩu', { exact: true });
  await expect(lengthRule(page)).toHaveText('Dùng từ 12 đến 128 ký tự.');
  await secret.fill(password);
  await expect(lengthRule(page)).toHaveText('Độ dài hợp lệ (từ 12 đến 128 ký tự).');
  await expect(page.locator('form').getByRole('button', { name: 'Tạo tài khoản', exact: true })).toBeEnabled();
  await expect(page.getByText('Đã có tài khoản?')).toBeVisible();
  expect(await page.locator('section.auth').innerText()).not.toMatch(/[–—]/);
  expect(await noOverflow(page)).toBe(true);
  await shot(page, 'invitation-create-vi-1280');

  await page.locator('.auth-switch').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.locator('form h2')).toHaveText('Đăng nhập');
  await expect(page.getByText('Hiện chưa thể đặt lại mật khẩu.')).toBeVisible();
  await expect(page.getByText('Lần đầu dùng noti.school?')).toBeVisible();
  await expect(page.getByText(/passkey/i)).toHaveCount(0);
  expect(await page.locator('section.auth').innerText()).not.toMatch(/[–—]/);
  await shot(page, 'signin-password-only-vi-1280');
});

for (const lang of ['en', 'vi'] as const) test(`390px (${lang}): the card comes first with 16px gutters, 44px targets and no horizontal scroll`, async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'password'] });
  await page.setViewportSize({ width: 390, height: 844 });
  const titles = { create: { en: 'Accept your invitation', vi: 'Chấp nhận lời mời của bạn' }, signin: { en: 'Sign in', vi: 'Đăng nhập' } };
  for (const mode of ['create', 'signin'] as const) {
    await page.goto(mode === 'create' ? invitationLink : '/#/auth');
    // A fresh document drops the invitation that the link left in memory.
    if (mode === 'signin') await page.reload();
    await expect(page.locator('form h2')).toBeVisible();
    if (lang === 'vi') {
      await card(page).getByRole('group', { name: /^(Language|Ngôn ngữ)$/ }).getByRole('button', { name: 'Tiếng Việt' }).click();
      await expect(page.locator('section.auth')).toHaveAttribute('lang', 'vi');
    }
    await expect(page.locator('form h2')).toHaveText(titles[mode][lang]);
    expect(await noOverflow(page)).toBe(true);
    const [cardBox, headingBox] = await Promise.all([box(card(page)), box(intro(page).locator('h1'))]);
    // Card first, then the brand column; the card runs gutter to gutter.
    expect(cardBox.y + cardBox.height).toBeLessThanOrEqual(headingBox.y);
    expect(Math.round(cardBox.x)).toBe(16);
    expect(Math.round(cardBox.x + cardBox.width)).toBe(390 - 16);
    await expect(intro(page).getByRole('listitem')).toHaveCount(2);
    // Every control in the card is a 44px target.
    const small = await card(page).evaluate((root) =>
      [...root.querySelectorAll<HTMLElement>('button, a, input')]
        .filter((control) => control.getClientRects().length > 0)
        .map((control) => ({ name: control.textContent?.trim() || control.getAttribute('aria-label') || control.getAttribute('name') || control.tagName, rect: control.getBoundingClientRect() }))
        .filter(({ rect }) => rect.height < 44 || rect.width < 44)
        .map(({ name, rect }) => `${name}: ${Math.round(rect.width)}x${Math.round(rect.height)}`));
    expect(small).toEqual([]);
    if (mode === 'create') {
      // The chip, its quiet link and the length line all stay inside the card.
      for (const part of [page.locator('.auth-chip'), page.locator('.auth-invitation button'), lengthRule(page), emailField(page)]) {
        const rect = await box(part);
        expect(rect.x).toBeGreaterThanOrEqual(cardBox.x);
        expect(rect.x + rect.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
      }
    }
    await shot(page, `${mode}-password-only${lang === 'vi' ? '-vi' : ''}-390`);
  }
});

for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) test(`the glass card keeps AA contrast for its text at ${size.width}px`, async ({ page }) => {
  await fixture(page, { user: null, available: ['identity', 'password'] });
  await page.setViewportSize(size);
  await page.goto(invitationLink);
  await expect(page.locator('form h2')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.style)).toBe('glass');
  // Empty the card and measure what its text is drawn on, pastel light and blur included. The
  // inset stays inside the rounded corners and reaches out to where the card's padding begins.
  await page.addStyleTag({ content: '.auth-card > * { visibility: hidden !important; }' });
  const surface = await darkest(page, card(page), 18);
  const colours = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return ['--ink', '--ink-soft', '--muted', '--cyan'].map((name) => root.getPropertyValue(name).trim());
  });
  for (const colour of colours) {
    expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
    expect((surface + 0.05) / (luminance(colour) + 0.05), colour).toBeGreaterThanOrEqual(4.5);
  }
});

test.describe('synthetic demo server as it ships (password-only)', () => {
  let demo: Demo;
  test.beforeEach(async ({ page }) => {
    demo = await startDemo();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect((await demo.call('POST', '/api/auth/sign-out', {})).status).toBe(200);
  });
  test.afterEach(() => { demo?.stop(); });

  test('invited sign-up and password sign-in work end to end with no passkey anywhere', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => { if (request.url().includes('/api/auth/')) requests.push(new URL(request.url()).pathname); });
    const capabilities = (await demo.call('GET', '/api/v1/capabilities')).json as { passkey: { state: string }; password: { state: string } };
    expect([capabilities.password.state, capabilities.passkey.state]).toEqual(['available', 'disabled']);
    expect((await demo.call('GET', '/api/auth/passkey/generate-authenticate-options')).status).toBe(404);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${demo.site}/#/auth?invitation=demo-invite`);
    await expect(page.locator('form h2')).toHaveText('Accept your invitation');
    await emailField(page).fill('invited.student@example.edu');
    await secretField(page).fill(password);
    await page.locator('form').getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('Account created. You are signed in and your invitation is redeemed.');
    await expect(page.getByRole('list', { name: 'Institution memberships' })).toContainText('Example University');
    await expect(page.getByRole('group', { name: 'Add a passkey for faster sign-in' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Passkeys' })).toHaveCount(0);
    await expect(page.getByText(/passkey/i)).toHaveCount(0);
    expect(await noOverflow(page)).toBe(true);
    await shot(page, 'account-password-only-1280');

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Signed out.');
    await expect(page.locator('form h2')).toHaveText('Sign in');
    await expect(passkeyButton(page)).toHaveCount(0);
    await expect(page.getByText('or with email')).toHaveCount(0);
    await expect(emailField(page)).toHaveAttribute('autocomplete', 'email');
    await expect(page.getByText('Password reset is not available yet.')).toBeVisible();
    await emailField(page).fill('invited.student@example.edu');
    await secretField(page).fill(password);
    await signInButton(page).click();
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await expect(page.locator('.account-id')).toHaveText('demo-account-1');
    expect(requests.filter((path) => path.includes('/passkey/'))).toEqual([]);
  });
});
