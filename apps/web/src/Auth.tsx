import { createEffect, createMemo, createSignal, createUniqueId, on, Show, For, onCleanup, type JSX } from 'solid-js';
import { ArrowLeft, Building2, ChevronDown, Eye, EyeOff, Fingerprint, KeyRound, LogOut, MailCheck, ShieldCheck, Ticket, Trash2, UserPlus, UserRound } from 'lucide-solid';
import { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { request, get, post, RequestError, takeAuthCallback } from './api';
import { passkeyAutofillSupported, passkeySupported, PasskeyError, signInWithPasskey, stopPasskeyAutofill } from './passkey';
import Passkeys, { serviceProblem, type Notice } from './Passkeys';
import { enter } from './ui/motion';
import { Loader } from './ui/Loader';
import type { Lang } from './ui/format';
import { t, type StringKey } from './ui/i18n';
import './ui/account.css';

// intent: the account page. Signed out it offers only the sign-in methods the server reports as
// available (password, passkey, Google) and invited sign-up with a password; signed in it shows the
// account, its passkeys and invitation redemption. Registration stays invite-only: sign-up always
// carries the invitation, and a passkey only signs in an account that already exists.
// status: done | next: rehearse against the real auth worker (mail off with invitation-verified
// email, and mail on) and with real authenticators
// confidence: medium (flows verified against route mocks and the synthetic demo server only)
const nativeSuccess = z.union([
  z.object({ status: z.literal(true) }),
  z.object({ success: z.literal(true) }),
  z.object({ user: z.object({ id: z.string() }) }),
  z.object({ url: z.url(), redirect: z.boolean().optional() }),
]);
type Mode = 'signIn' | 'create' | 'redeem' | 'verify' | 'reset';
const title: Record<Mode, StringKey> = {
  signIn: 'authModeSignIn',
  create: 'authModeCreate',
  redeem: 'authModeRedeem',
  verify: 'authModeVerify',
  reset: 'authModeReset',
};
const icon: Record<Mode, () => JSX.Element> = {
  signIn: () => <KeyRound size={18} />,
  create: () => <UserPlus size={18} />,
  redeem: () => <Ticket size={18} />,
  verify: () => <MailCheck size={18} />,
  reset: () => <ShieldCheck size={18} />,
};
const languages: { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'vi', name: 'Tiếng Việt' },
];

// Every session change remounts this view (App keys it on the access scope), so what has to
// outlive a sign-in is kept here: in memory only, never in storage. The outcome line, the email
// prefill and the passkey offer are dropped when the visitor leaves the account page; an invitation
// stays for the tab until it is redeemed or replaced.
const [notice, setNotice] = createSignal<Notice>();
const [passkeyOffer, setPasskeyOffer] = createSignal(false);
const [invitation, setInvitation] = createSignal('');
const [knownEmail, setKnownEmail] = createSignal('');

const problem = (key: StringKey): Notice => ({ key, tone: 'problem' });
const done = (key: StringKey): Notice => ({ key, tone: 'done' });
const generalProblem = (error: unknown) => problem(serviceProblem(error) ?? 'authErrGeneric');
function signInProblem(error: unknown) {
  const service = serviceProblem(error);
  if (service || !(error instanceof RequestError)) return problem(service ?? 'authErrGeneric');
  if (error.status === 401) return problem('authErrSignIn');
  if (error.status === 403) return problem('authErrNotVerified');
  return problem(error.status === 400 || error.status === 422 ? 'authErrForm' : 'authErrGeneric');
}
function signUpProblem(error: unknown) {
  const service = serviceProblem(error);
  if (service) return problem(service);
  return problem(error instanceof RequestError && error.status === 403 ? 'authErrInvitation' : 'authErrSignUp');
}
function redeemProblem(error: unknown) {
  const service = serviceProblem(error);
  if (service || !(error instanceof RequestError)) return problem(service ?? 'authErrGeneric');
  return problem(error.status === 401 ? 'authErrSession' : 'authErrInvitation');
}
function passkeyProblem(error: unknown): Notice {
  // A dismissed prompt is the visitor's choice: say so calmly and leave the other methods in place.
  if (error instanceof PasskeyError)
    return error.reason === 'cancelled' ? { key: 'authPasskeySignInCancelled', tone: 'calm' } : problem('authPasskeyRefused');
  const service = serviceProblem(error);
  if (service || !(error instanceof RequestError)) return problem(service ?? 'authErrGeneric');
  return problem([400, 401, 404].includes(error.status) ? 'authPasskeyUnknown' : 'authErrGeneric');
}

export default function Auth(props: {
  callback?: ReturnType<typeof takeAuthCallback> | undefined;
  capabilities: z.infer<typeof Schemas.Capabilities> | undefined;
  /** Capabilities are being read for the first time; nothing is known yet. */
  checking?: boolean;
  authenticated: boolean;
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Re-reads the session and capabilities; resolves once the session is known. */
  refresh: () => Promise<void> | void;
  signedOut: () => void;
  deletionSpent: () => void;
  /** The invitation from the link now lives in this module's memory; the callback copy can go. */
  invitationTaken?: () => void;
  // Supplied by App once the session is known; the identity card degrades when it is absent.
  account?: { userId: string; memberships: { institution: string; role: 'student' | 'admin' }[] } | undefined;
  /** A redeemed invitation selects the new institution so the next question goes to it. */
  joined?: (institutionId: string) => void;
}) {
  let disposed = false;
  onCleanup(() => {
    disposed = true;
    stopPasskeyAutofill();
    if (location.hash.startsWith('#/auth')) return;
    setNotice(undefined);
    setPasskeyOffer(false);
    setKnownEmail('');
  });
  const label = (key: StringKey) => t(props.lang, key);
  const callback = props.callback ?? takeAuthCallback(location.href);
  window.history.replaceState(null, '', callback.clean);
  const [resetToken, setResetToken] = createSignal(callback.token);
  const [deleteToken, setDeleteToken] = createSignal(callback.deletion);
  // A consumed or attempted token must not reappear when this view remounts.
  const spendDeletion = () => { setDeleteToken(''); props.deletionSpent(); };
  if (callback.invitation) {
    setInvitation(callback.invitation);
    props.invitationTaken?.();
  }
  if (callback.error) setNotice(problem('authMsgCallbackError'));
  const [googleInvitation, setGoogleInvitation] = createSignal(invitation());
  // Signed-in visitors land on the invitation form; an invitation link opens sign-up; everyone else signs in.
  const [mode, setMode] = createSignal<Mode>(
    resetToken() ? 'reset' : props.authenticated ? 'redeem' : invitation() ? 'create' : 'signIn',
  );
  const [busy, setBusy] = createSignal(false);
  const go = (next: Mode) => {
    setMode(next);
    setNotice(undefined);
  };
  // Follow account changes without clearing the result message.
  createEffect(on(() => props.authenticated, (signedIn) => {
    if (signedIn && (mode() === 'signIn' || mode() === 'create' || mode() === 'verify')) setMode('redeem');
    if (!signedIn && mode() === 'redeem') setMode('signIn');
  }, { defer: true }));

  // Each option follows the capability the server reports for it; an option that is not available is not shown.
  const ready = (name: 'identity' | 'google' | 'email' | 'password' | 'passkey') =>
    props.capabilities?.[name].state === 'available';
  const identityReady = () => ready('identity');
  const emailReady = () => identityReady() && ready('email');
  const canPassword = () => identityReady() && ready('password');
  const canGoogle = () => identityReady() && ready('google');
  // Without WebAuthn or its JSON helpers the passkey button simply is not there.
  const browserPasskeys = passkeySupported();
  const canPasskey = () => identityReady() && ready('passkey') && browserPasskeys;
  // The form on screen. A mode whose capability is gone falls back to sign-in.
  const shown = (): Mode => {
    const wanted = mode();
    if (props.authenticated) return wanted === 'reset' ? 'reset' : 'redeem';
    if (wanted === 'reset') return resetToken() || emailReady() ? 'reset' : 'signIn';
    if (wanted === 'create') return canPassword() ? 'create' : 'signIn';
    if (wanted === 'verify') return canPassword() && emailReady() ? 'verify' : 'signIn';
    return 'signIn';
  };
  const signInScreen = () => !props.authenticated && shown() === 'signIn';
  const formShown = () => !signInScreen() || canPassword();
  let panel: HTMLDivElement | undefined;
  createEffect(on(shown, () => enter(panel, { opacity: [0, 1], y: [10, 0] }, { duration: 0.34 }), { defer: true }));

  let line: HTMLParagraphElement | undefined;
  const message = () => {
    const current = notice();
    return current ? label(current.key) : '';
  };
  /** A re-rendered list drops focus to the page; land it on the outcome instead. */
  const report = (next: Notice | undefined) => {
    setNotice(next);
    if (next) queueMicrotask(() => { if (!disposed && document.activeElement === document.body) line?.focus(); });
  };
  /** One account action at a time. The work announces its own success; a failure is announced here. */
  async function run(work: () => Promise<void>, failed: (error: unknown) => Notice) {
    if (busy()) return;
    setBusy(true);
    setNotice(undefined);
    try {
      await work();
    } catch (error) {
      if (!disposed) setNotice(failed(error));
    } finally {
      if (!disposed) setBusy(false);
    }
  }
  const call = (path: string, body: unknown, schema: z.ZodType<unknown> = nativeSuccess, invitationToken = '') =>
    request(`/api/auth/${path}`, schema, {
      method: 'POST',
      body: JSON.stringify(body),
      ...(invitationToken ? { headers: { 'X-Noti-Invitation': invitationToken } } : {}),
    });
  const callbackURL = () => location.origin + '/#/auth';
  const refreshed = async () => {
    try { await props.refresh(); } catch { /* The session read reports its own failure. */ }
  };
  /**
   * A session now exists. Redeem an invitation that is waiting, as the invitation form would, then
   * let the app read the session. The outcome is stored first: the session change remounts this view.
   */
  async function entered(outcome: { plain: StringKey; redeemed: StringKey; unredeemed: StringKey }) {
    const token = invitation();
    let next = done(outcome.plain);
    let institution = '';
    if (token) {
      try {
        institution = (await post('/api/auth/invitations/redeem', 'Membership', { token })).institution_id;
        next = done(outcome.redeemed);
      } catch {
        // The token stays in memory, so the invitation form on the account page can retry it.
        next = problem(outcome.unredeemed);
      }
    }
    if (disposed) return;
    if (institution) setInvitation('');
    setKnownEmail('');
    setNotice(next);
    await refreshed();
    if (institution) props.joined?.(institution);
  }
  const signedIn = { plain: 'authMsgSignedIn', redeemed: 'authMsgSignedInRedeemed', unredeemed: 'authMsgSignedInRedeemFailed' } as const;

  const signIn = (email: string, password: string) => run(async () => {
    await call('sign-in/email', { email, password });
    if (!disposed) await entered(signedIn);
  }, signInProblem);
  const signUp = (email: string, password: string, token: string) => run(async () => {
    // Better Auth requires a display name; the form asks only for what sign-in needs.
    await call('sign-up/email', { email, password, name: email.split('@')[0] || email, callbackURL: callbackURL() }, nativeSuccess, token);
    if (disposed) return;
    setInvitation(token);
    setPasskeyOffer(true);
    // The server either signs the new member in (the invitation verified the email) or wants the
    // email verified first. Only a readable session counts as signed in.
    const session = await get('/api/v1/me', 'Me').then(() => true, () => false);
    if (disposed) return;
    if (session) return entered({ plain: 'authMsgCreatedSignedIn', redeemed: 'authMsgCreatedSignedIn', unredeemed: 'authMsgCreatedRedeemFailed' });
    setKnownEmail(email);
    setMode('signIn');
    setNotice(done(emailReady() ? 'authMsgCreatedCheckEmail' : 'authMsgCreatedSignIn'));
  }, signUpProblem);
  const passkeySignIn = () => run(async () => {
    await signInWithPasskey();
    if (!disposed) await entered(signedIn);
  }, passkeyProblem);
  const redeem = (token: string) => run(async () => {
    const membership = await post('/api/auth/invitations/redeem', 'Membership', { token });
    if (disposed) return;
    setInvitation('');
    setNotice(done('authMsgRedeemed'));
    await refreshed();
    props.joined?.(membership.institution_id);
  }, redeemProblem);
  const signOut = () => run(async () => {
    await call('sign-out', {});
    if (disposed) return;
    setPasskeyOffer(false);
    setNotice(done('authMsgSignedOut'));
    props.signedOut();
    void props.refresh();
  }, generalProblem);
  const requested = (path: string, body: unknown, outcome: StringKey) => run(async () => {
    await call(path, body);
    if (disposed) return;
    if (path === 'reset-password') setResetToken('');
    setNotice(done(outcome));
    void props.refresh();
  }, generalProblem);
  const deleteAccount = () => {
    const confirming = !!deleteToken();
    return run(async () => {
      await call(
        'delete-user',
        confirming ? { token: deleteToken() } : { callbackURL: callbackURL() },
        z.object({ success: z.literal(true), message: z.literal(confirming ? 'User deleted' : 'Verification email sent') }),
      );
      if (disposed) return;
      spendDeletion();
      setNotice(done(confirming ? 'authMsgDeleted' : 'authMsgDeletionRequested'));
      if (confirming) {
        setPasskeyOffer(false);
        props.signedOut();
      }
      void props.refresh();
    }, (error) => {
      if (!confirming) return generalProblem(error);
      spendDeletion();
      return problem('authErrDeletion');
    });
  };
  async function google() {
    if (busy()) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const value = await request(
        '/api/auth/sign-in/social',
        z.object({ url: z.url(), redirect: z.boolean().optional() }),
        {
          method: 'POST',
          body: JSON.stringify({ provider: 'google', callbackURL: callbackURL() }),
          ...(googleInvitation() ? { headers: { 'X-Noti-Invitation': googleInvitation() } } : {}),
        },
      );
      if (disposed) return;
      const url = new URL(value.url);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com')
        throw new Error('Unsafe redirect');
      location.assign(url.href);
    } catch (e) {
      if (!disposed) setNotice(generalProblem(e));
    } finally {
      if (!disposed) setBusy(false);
    }
  }
  // Saved passkeys are also offered from the email field where the browser supports it. The request
  // waits quietly; leaving the sign-in form or pressing the passkey button ends it.
  const autofill = createMemo(() => signInScreen() && canPasskey() && canPassword());
  createEffect(on(autofill, (wanted) => {
    if (!wanted) return;
    let stale = false;
    onCleanup(() => {
      stale = true;
      stopPasskeyAutofill();
    });
    void passkeyAutofillSupported().then((available) => {
      if (!available || stale || disposed || busy()) return;
      signInWithPasskey({ autofill: true }).then(
        () => { if (!disposed) void run(() => entered(signedIn), generalProblem); },
        (error: unknown) => {
          // A request that was never used, or was replaced, is not an outcome. A passkey the visitor
          // picked and the server turned away is.
          if (disposed || (error instanceof PasskeyError && error.reason === 'cancelled')) return;
          setNotice(passkeyProblem(error));
        },
      );
    });
  }));

  // Deletion stays collapsed unless a confirmation token is waiting; spending the token does not collapse it.
  const [dangerOpen, setDangerOpen] = createSignal(!!deleteToken());
  createEffect(() => { if (deleteToken()) setDangerOpen(true); });
  const memberships = () => props.account?.memberships ?? [];
  function submit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault();
    if (busy()) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const token = String(data.get('token') || '').trim();
    const current = shown();
    if (current === 'redeem') return void redeem(token);
    if (current === 'signIn') return void signIn(email, password);
    if (current === 'create') return void signUp(email, password, invitation() || token);
    if (current === 'verify')
      return void requested('send-verification-email', { email, callbackURL: callbackURL() }, 'authMsgAccepted');
    return void (token
      ? requested('reset-password', { token, newPassword: password }, 'authMsgPasswordUpdated')
      : requested('request-password-reset', { email, redirectTo: callbackURL() }, 'authMsgResetRequested'));
  }
  return (
    <section class="auth" classList={{ 'account-view': props.authenticated }} lang={props.lang}>
      <div class="auth-intro">
        <div class="auth-top">
          <span class="auth-badge">{label(props.authenticated ? 'authBadgeAccount' : 'authBadgeInvite')}</span>
          <div class="auth-lang" role="group" aria-label={label('authLanguage')}>
            <For each={languages}>
              {(language) => (
                <button
                  type="button"
                  lang={language.code}
                  aria-pressed={props.lang === language.code}
                  onClick={() => props.setLang(language.code)}
                >
                  {language.name}
                </button>
              )}
            </For>
          </div>
        </div>
        <h1 tabIndex={-1}>{label(props.authenticated ? 'authTitleAccount' : 'authTitleWelcome')}</h1>
        <Show
          when={props.authenticated}
          fallback={
            <>
              <p class="muted">{label('authIntroGuest')}</p>
              <ul class="auth-points">
                <li>{label('authPointCitations')}</li>
                <li>{label('authPointDraft')}</li>
              </ul>
            </>
          }
        >
          <p class="muted">{label('authIntroAccount')}</p>
          <ul class="auth-points">
            <li>{label('authPointMemberships')}</li>
            <li>{label('authPointJoin')}</li>
          </ul>
        </Show>
      </div>
      <div class="auth-card">
        <Show when={props.authenticated}>
          <section class="account-identity" aria-labelledby="account-identity-title">
            <div class="account-who">
              <span class="account-avatar" aria-hidden="true"><UserRound size={22} /></span>
              <div class="account-who-text">
                <h2 id="account-identity-title" class="account-eyebrow">{label('authSignedInAs')}</h2>
                <Show
                  when={props.account}
                  fallback={<p class="muted account-id">{label('authNoDetails')}</p>}
                >
                  {(account) => <p class="account-id">{account().userId}</p>}
                </Show>
              </div>
            </div>
            <Show when={props.account}>
              <Show
                when={memberships().length > 0}
                fallback={<p class="muted account-none">{label('authNoMemberships')}</p>}
              >
                <ul class="account-memberships" aria-label={label('authMemberships')}>
                  <For each={memberships()}>
                    {(m) => (
                      <li>
                        <Building2 size={16} aria-hidden="true" />
                        <span class="account-institution">{m.institution}</span>
                        <span class="account-role" classList={{ 'account-role-admin': m.role === 'admin' }}>
                          {label(m.role === 'admin' ? 'authRoleAdmin' : 'authRoleStudent')}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
            <div class="auth-account-actions">
              <button type="button" disabled={busy()} onClick={() => void signOut()}>
                <LogOut size={16} /> {label('authSignOut')}
              </button>
              <a class="account-pill" href="#/">
                <ArrowLeft size={16} aria-hidden="true" />
                {label('authReturn')}
              </a>
            </div>
          </section>
        </Show>
        <Show when={deleteToken() && !props.authenticated}><p class="notice">{label('authDeleteSignInFirst')}</p></Show>
        <Show
          when={!props.checking}
          fallback={
            <Show when={!props.authenticated}>
              <p class="loading-status" aria-busy="true"><Loader size="sm" /> <span>{label('authChecking')}</span></p>
            </Show>
          }
        >
          <Show when={!identityReady()}>
            <p class="notice">{label('authNotConfirmed')}</p>
          </Show>
          <Show when={identityReady() && signInScreen() && !canPassword() && !canGoogle() && !canPasskey()}>
            <p class="notice">{label('authNoMethods')}</p>
          </Show>
        </Show>
        <div class="auth-panel" classList={{ 'account-section': props.authenticated }} ref={panel}>
          <Show when={shown() !== 'signIn' && !(props.authenticated && shown() === 'redeem')}>
            <button type="button" class="link-button auth-back" onClick={() => go(props.authenticated ? 'redeem' : 'signIn')}>
              <ArrowLeft size={16} /> {label(props.authenticated ? 'authBackAccount' : 'authBackSignIn')}
            </button>
          </Show>
          <Show when={signInScreen() && (canGoogle() || canPasskey())}>
            <div class="auth-google">
              <Show when={canGoogle()}>
                <button type="button" class="google" disabled={busy()} onClick={() => void google()}>
                  <GoogleMark />
                  {label('authGoogle')}
                </button>
                <details class="auth-invite">
                  <summary>{label('authGoogleInviteSummary')}</summary>
                  <label>
                    {label('authGoogleInviteLabel')}
                    <input
                      type="password"
                      autocomplete="off"
                      maxLength={256}
                      value={googleInvitation()}
                      onInput={(e) => setGoogleInvitation(e.currentTarget.value)}
                    />
                  </label>
                </details>
              </Show>
              <Show when={canPasskey()}>
                <button type="button" class="google passkey-signin" disabled={busy()} onClick={() => void passkeySignIn()}>
                  <Fingerprint size={18} aria-hidden="true" />
                  {label('authPasskeySignIn')}
                </button>
              </Show>
            </div>
            <Show when={canPassword()}>
              <div class="auth-divider"><span>{label('authDivider')}</span></div>
            </Show>
          </Show>
          <Show when={formShown()}>
          <form class="auth-form" onSubmit={submit}>
            <div class="auth-heading">
              <span class="auth-icon" aria-hidden="true">{icon[shown()]()}</span>
              <div>
                <h2>{label(title[shown()])}</h2>
                <p class="muted">
                  {label(
                    shown() === 'signIn' ? 'authIntroSignIn'
                      : shown() === 'create' ? (invitation() ? 'authIntroCreateInvited' : 'authIntroCreate')
                        : shown() === 'redeem' ? 'authIntroRedeem'
                          : shown() === 'verify' ? 'authIntroVerify'
                            : 'authIntroReset',
                  )}
                </p>
              </div>
            </div>
            <Show when={shown() !== 'redeem'}>
              <label>
                {label('authEmail')}
                <input
                  name="email"
                  type="email"
                  // "webauthn" lets the browser offer saved passkeys from this field.
                  autocomplete={shown() === 'signIn' && canPasskey() ? 'username webauthn' : 'email'}
                  value={shown() === 'signIn' ? knownEmail() : ''}
                  required={shown() !== 'reset' || !resetToken()}
                />
              </label>
            </Show>
            <Show when={shown() === 'signIn' || shown() === 'create' || shown() === 'reset'}>
              <PasswordField
                lang={props.lang}
                label={label(shown() === 'reset' ? 'authNewPassword' : 'authPassword')}
                autocomplete={shown() === 'signIn' ? 'current-password' : 'new-password'}
                required={shown() !== 'reset' || !!resetToken()}
                hint={shown() === 'signIn' ? '' : label('authPasswordHint')}
              >
                <Show when={shown() === 'signIn'}>
                  <Show
                    when={emailReady()}
                    fallback={<p class="muted auth-fine auth-forgot">{label('authResetNeedsEmail')}</p>}
                  >
                    <button type="button" class="link-button auth-forgot" onClick={() => go('reset')}>
                      {label('authForgot')}
                    </button>
                  </Show>
                </Show>
              </PasswordField>
            </Show>
            <Show when={shown() === 'create' && invitation()}>
              <p class="muted auth-fine auth-attached">
                <Ticket size={15} aria-hidden="true" /> {label('authInvitationAttached')}{' '}
                <button type="button" class="link-button" onClick={() => setInvitation('')}>
                  {label('authInvitationOther')}
                </button>
              </p>
            </Show>
            <Show when={(shown() === 'create' && !invitation()) || shown() === 'redeem' || shown() === 'reset'}>
              <label>
                {label(shown() === 'reset' ? 'authResetToken' : 'authInvitationToken')}
                <input
                  name="token"
                  type="password"
                  autocomplete="off"
                  maxLength={256}
                  value={shown() === 'reset' ? resetToken() : shown() === 'redeem' ? invitation() : ''}
                  onInput={(e) => {
                    if (shown() === 'reset') setResetToken(e.currentTarget.value);
                  }}
                  required={shown() !== 'reset'}
                />
              </label>
            </Show>
            <button
              class="primary auth-submit"
              type="submit"
              disabled={busy() || !identityReady() || (shown() === 'reset' && !resetToken() && !emailReady())}
            >
              <Show when={busy()}><Loader size="sm" /></Show>
              {label(
                busy() ? 'authWait'
                  : shown() === 'verify' ? 'authSendVerification'
                    : shown() === 'reset' ? 'authContinue'
                      : title[shown()],
              )}
            </button>
          </form>
          </Show>
          <Show when={!props.authenticated && identityReady()}>
            <div class="auth-switch">
              <Show when={shown() === 'create'}>
                <p>
                  {label('authHaveAccount')}{' '}
                  <button type="button" class="link-button" onClick={() => go('signIn')}>{label('authModeSignIn')}</button>
                </p>
              </Show>
              <Show when={shown() !== 'create'}>
                <Show
                  when={canPassword()}
                  fallback={
                    // One calm line instead of a sign-up path that cannot work.
                    <p>
                      {label('authSignUpUnavailable')}
                      <Show when={invitation()}> {label('authInvitationKept')}</Show>
                    </p>
                  }
                >
                  <p>
                    {label('authNewHere')}{' '}
                    <button type="button" class="link-button" onClick={() => go('create')}>{label('authModeCreate')}</button>
                  </p>
                  <Show when={emailReady() && shown() !== 'verify'}>
                    <p class="auth-more">
                      <button type="button" class="link-button" onClick={() => go('verify')}>{label('authResend')}</button>
                    </p>
                  </Show>
                </Show>
              </Show>
            </div>
          </Show>
        </div>
        <p role="status" class="auth-message" data-tone={notice()?.tone} tabIndex={-1} ref={line}>
          {message()}
        </p>
        <Show when={props.authenticated && identityReady() && ready('passkey')}>
          <Passkeys
            lang={props.lang}
            busy={busy()}
            offer={passkeyOffer()}
            dismissOffer={() => setPasskeyOffer(false)}
            report={report}
          />
        </Show>
        <Show when={props.authenticated}>
          <details
            class="account-danger"
            open={dangerOpen()}
            onToggle={(e) => setDangerOpen(e.currentTarget.open)}
          >
            <summary>
              <Trash2 size={16} aria-hidden="true" />
              <span>{label('authDelete')}</span>
              <ChevronDown size={16} class="account-chevron" aria-hidden="true" />
            </summary>
            <div class="account-danger-body">
              <Show
                when={emailReady()}
                // Deletion is confirmed by email; without mail there is no action to offer.
                fallback={<p class="muted">{label('authDeletionNeedsEmail')}</p>}
              >
                <p class="muted">{label('authDeleteAbout')}</p>
                <button type="button" class="danger-quiet" disabled={busy()} onClick={() => {
                  if (confirm(label('authDeletePrompt'))) void deleteAccount();
                }}>{label(deleteToken() ? 'authDeleteConfirm' : 'authDeleteRequest')}</button>
              </Show>
            </div>
          </details>
        </Show>
      </div>
    </section>
  );
}

/** A password box with a show/hide switch. The switch sits outside the label so the field keeps its plain name. */
function PasswordField(props: {
  lang: Lang;
  label: string;
  autocomplete: 'current-password' | 'new-password';
  required: boolean;
  hint: string;
  children?: JSX.Element;
}) {
  const id = createUniqueId();
  const [visible, setVisible] = createSignal(false);
  return (
    <div class="auth-password">
      <label for={id}>{props.label}</label>
      <div class="auth-secret">
        <input
          id={id}
          name="password"
          type={visible() ? 'text' : 'password'}
          autocomplete={props.autocomplete}
          minlength={12}
          maxlength={128}
          required={props.required}
          aria-describedby={props.hint ? `${id}-hint` : undefined}
        />
        <button
          type="button"
          class="auth-reveal"
          aria-label={t(props.lang, 'authShowPassword')}
          aria-pressed={visible()}
          title={t(props.lang, visible() ? 'authHidePassword' : 'authShowPassword')}
          onClick={() => setVisible((value) => !value)}
        >
          <Show when={visible()} fallback={<Eye size={18} aria-hidden="true" />}>
            <EyeOff size={18} aria-hidden="true" />
          </Show>
        </button>
      </div>
      <Show when={props.hint}>
        <p id={`${id}-hint`} class="muted auth-fine auth-hint">{props.hint}</p>
      </Show>
      {props.children}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.6 0 20.2 0 24s1 7.4 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.2 1.5-5 2.4-8.7 2.4-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
