import { createEffect, createSignal, on, Show, For, onCleanup, type JSX } from 'solid-js';
import { ArrowLeft, Building2, ChevronDown, KeyRound, LogOut, MailCheck, ShieldCheck, Ticket, Trash2, UserPlus, UserRound } from 'lucide-solid';
import { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { request, post, errorText, takeAuthCallback } from './api';
import { enter } from './ui/motion';
import { Loader } from './ui/Loader';
import './ui/account.css';
const nativeSuccess = z.union([
  z.object({ status: z.literal(true) }),
  z.object({ success: z.literal(true) }),
  z.object({ user: z.object({ id: z.string() }) }),
  z.object({ url: z.url(), redirect: z.boolean().optional() }),
]);
const modes = [
  'Sign in',
  'Create account',
  'Redeem invitation',
  'Verify email',
  'Reset password',
] as const;
type Mode = (typeof modes)[number];
const intro: Record<Mode, string> = {
  'Sign in': 'Use your pilot account or Google.',
  'Create account': 'New accounts need an invitation token from your institution.',
  'Redeem invitation': 'Add an invitation to the account you are signed in to.',
  'Verify email': 'Send a new verification link to your address.',
  'Reset password': 'Request a reset email, or set a new password with the token from it.',
};
const icon: Record<Mode, () => JSX.Element> = {
  'Sign in': () => <KeyRound size={18} />,
  'Create account': () => <UserPlus size={18} />,
  'Redeem invitation': () => <Ticket size={18} />,
  'Verify email': () => <MailCheck size={18} />,
  'Reset password': () => <ShieldCheck size={18} />,
};
export default function Auth(props: {
  callback?: ReturnType<typeof takeAuthCallback> | undefined;
  capabilities: z.infer<typeof Schemas.Capabilities> | undefined;
  authenticated: boolean;
  refresh: () => void;
  signedOut: () => void;
  deletionSpent: () => void;
  // Supplied by App once the session is known; the identity card degrades when it is absent.
  account?: { userId: string; memberships: { institution: string; role: 'student' | 'admin' }[] } | undefined;
  /** A redeemed invitation selects the new institution so the next question goes to it. */
  joined?: (institutionId: string) => void;
}) {
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const callback = props.callback ?? takeAuthCallback(location.href);
  window.history.replaceState(null, '', callback.clean);
  const [resetToken, setResetToken] = createSignal(callback.token);
  const [deleteToken, setDeleteToken] = createSignal(callback.deletion);
  // A consumed or attempted token must not reappear when this view remounts.
  const spendDeletion = () => { setDeleteToken(''); props.deletionSpent(); };
  const [googleInvitation, setGoogleInvitation] = createSignal('');
  // Signed-in visitors land on the invitation form; everyone else on sign-in.
  const [mode, setMode] = createSignal<Mode>(
    resetToken() ? 'Reset password' : props.authenticated ? 'Redeem invitation' : 'Sign in',
  );
  const [busy, setBusy] = createSignal(false),
    [message, setMessage] = createSignal(callback.error ? 'Sign-in or recovery could not be completed. Please try again.' : '');
  const go = (next: Mode) => {
    setMode(next);
    setMessage('');
  };
  // Follow account changes without clearing the result message.
  createEffect(on(() => props.authenticated, (signedIn) => {
    if (signedIn && (mode() === 'Sign in' || mode() === 'Create account' || mode() === 'Verify email')) setMode('Redeem invitation');
    if (!signedIn && mode() === 'Redeem invitation') setMode('Sign in');
  }, { defer: true }));
  let panel: HTMLDivElement | undefined;
  createEffect(on(mode, () => enter(panel, { opacity: [0, 1], y: [10, 0] }, { duration: 0.34 }), { defer: true }));
  const identityDown = () => props.capabilities?.identity.state !== 'available';
  const emailDown = () => props.capabilities?.email.state !== 'available';
  async function send(path: string, body: unknown, invitation?: string) {
    if (busy()) return;
    setBusy(true);
    setMessage('');
    try {
      const success = path === 'delete-user'
        ? z.object({ success: z.literal(true), message: z.literal(deleteToken() ? 'User deleted' : 'Verification email sent') })
        : nativeSuccess;
      await request(`/api/auth/${path}`, success, {
        method: 'POST',
        body: JSON.stringify(body),
        ...(invitation ? { headers: { 'X-Noti-Invitation': invitation } } : {}),
      });
      if (disposed) return;
      const ended = path === 'sign-out' || (path === 'delete-user' && !!deleteToken());
      setMessage(
        path === 'sign-out'
          ? 'Signed out.'
          : path.includes('sign-in')
            ? 'Signed in. Return to your question.'
            : path === 'request-password-reset'
              ? 'If this account is eligible, the request is processed. Email delivery is not confirmed.'
              : path === 'reset-password'
                ? 'Password updated. You can sign in.'
                : path === 'delete-user'
                  ? deleteToken() ? 'Account deleted.' : 'Confirmation requested. Check your email; the account has not been deleted.'
                : 'Request accepted. Follow the instructions for your account.',
      );
      if (path === 'reset-password') setResetToken('');
      if (path === 'delete-user') spendDeletion();
      if (ended) props.signedOut();
      props.refresh();
    } catch (e) {
      if (disposed) return;
      const confirmingDeletion = path === 'delete-user' && !!deleteToken();
      if (confirmingDeletion) spendDeletion();
      setMessage(errorText(e) + (confirmingDeletion ? ' Request a new email confirmation before retrying deletion.' : ''));
    } finally {
      if (!disposed) setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    try {
      const value = await request(
        '/api/auth/sign-in/social',
        z.object({ url: z.url(), redirect: z.boolean().optional() }),
        {
          method: 'POST',
          body: JSON.stringify({
            provider: 'google',
            callbackURL: location.origin + '/#/auth',
          }),
          ...(googleInvitation()
            ? { headers: { 'X-Noti-Invitation': googleInvitation() } }
            : {}),
        },
      );
      if (disposed) return;
      const url = new URL(value.url);
      if (url.protocol !== 'https:' || url.hostname !== 'accounts.google.com')
        throw new Error('Unsafe redirect');
      location.assign(url.href);
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  // Signed-in visitors only reach invitation redemption, or the reset form opened by a reset callback token.
  const signedInForm = () => mode() === 'Redeem invitation' || mode() === 'Reset password';
  // Deletion stays collapsed unless a confirmation token is waiting; spending the token does not collapse it.
  const [dangerOpen, setDangerOpen] = createSignal(!!deleteToken());
  createEffect(() => { if (deleteToken()) setDangerOpen(true); });
  const memberships = () => props.account?.memberships ?? [];
  return (
    <section class="auth" classList={{ 'account-view': props.authenticated }}>
      <div class="auth-intro">
        <span class="auth-badge">{props.authenticated ? 'Pilot account' : 'Invitation-only pilot'}</span>
        <h1 tabIndex={-1}>{props.authenticated ? 'Your account' : 'Welcome to noti.school'}</h1>
        <Show
          when={props.authenticated}
          fallback={
            <>
              <p class="muted">
                Access the collections shared with you. Pilot membership is by invitation.
              </p>
              <ul class="auth-points">
                <li>Answers link to the original document version and page.</li>
                <li>Your question draft is kept in this tab while you sign in.</li>
              </ul>
            </>
          }
        >
          <p class="muted">
            See who you are signed in as and which institutions you belong to.
          </p>
          <ul class="auth-points">
            <li>Your memberships decide which collections you can ask about.</li>
            <li>Join another institution with an invitation token from it.</li>
          </ul>
        </Show>
      </div>
      <div class="auth-card">
        <Show when={props.authenticated}>
          <section class="account-identity" aria-labelledby="account-identity-title">
            <div class="account-who">
              <span class="account-avatar" aria-hidden="true"><UserRound size={22} /></span>
              <div class="account-who-text">
                <h2 id="account-identity-title" class="account-eyebrow">Signed in as</h2>
                <Show
                  when={props.account}
                  fallback={<p class="muted account-id">Account details are not available right now.</p>}
                >
                  {(account) => <p class="account-id">{account().userId}</p>}
                </Show>
              </div>
            </div>
            <Show when={props.account}>
              <Show
                when={memberships().length > 0}
                fallback={<p class="muted account-none">No institution memberships yet. Redeem an invitation below.</p>}
              >
                <ul class="account-memberships" aria-label="Institution memberships">
                  <For each={memberships()}>
                    {(m) => (
                      <li>
                        <Building2 size={16} aria-hidden="true" />
                        <span class="account-institution">{m.institution}</span>
                        <span class="account-role" classList={{ 'account-role-admin': m.role === 'admin' }}>
                          {m.role === 'admin' ? 'Admin' : 'Student'}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
            <div class="auth-account-actions">
              <button type="button" onClick={() => void send('sign-out', {})}>
                <LogOut size={16} /> Sign out
              </button>
              <a class="account-pill" href="#/">
                <ArrowLeft size={16} aria-hidden="true" />
                Return to your question
              </a>
            </div>
          </section>
        </Show>
        <Show when={deleteToken() && !props.authenticated}><p class="notice">Sign in to the account before confirming deletion. Keep this tab open.</p></Show>
        <Show when={identityDown()}>
          <p class="notice">
            Sign-in availability is not confirmed. Your question draft is kept in this tab.
          </p>
        </Show>
        <div class="auth-panel" classList={{ 'account-section': props.authenticated }} ref={panel}>
          <Show when={mode() !== 'Sign in' && !(props.authenticated && mode() === 'Redeem invitation')}>
            <button type="button" class="link-button auth-back" onClick={() => go(props.authenticated ? 'Redeem invitation' : 'Sign in')}>
              <ArrowLeft size={16} /> {props.authenticated ? 'Back to your account' : 'Back to sign in'}
            </button>
          </Show>
          <Show when={mode() === 'Sign in' && !props.authenticated}>
            <div class="auth-google">
              <button
                type="button"
                class="google"
                disabled={busy() || props.capabilities?.google.state !== 'available'}
                onClick={() => void google()}
              >
                <GoogleMark />
                Continue with Google
              </button>
              <Show when={props.capabilities?.google.state !== 'available'}>
                <p class="muted auth-fine">Google sign-in is not available yet.</p>
              </Show>
              <details class="auth-invite">
                <summary>New to noti.school with Google? Add your invitation</summary>
                <label>
                  Invitation token (new Google accounts)
                  <input
                    type="password"
                    autocomplete="off"
                    maxLength={256}
                    value={googleInvitation()}
                    onInput={(e) => setGoogleInvitation(e.currentTarget.value)}
                  />
                </label>
              </details>
            </div>
            <div class="auth-divider"><span>or with email</span></div>
          </Show>
          <Show when={!props.authenticated || signedInForm()}>
          <form
            class="auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy()) return;
              const data = new FormData(e.currentTarget);
              const email = String(data.get('email') || '');
              const password = String(data.get('password') || '');
              const token = String(data.get('token') || '');
              if (mode() === 'Redeem invitation') {
                setBusy(true);
                try {
                  const membership = await post('/api/auth/invitations/redeem', 'Membership', { token });
                  if (disposed) return;
                  setMessage('Invitation redeemed. Your new institution is selected. Return to your question to ask it there.');
                  props.joined?.(membership.institution_id);
                  props.refresh();
                } catch (err) {
                  if (!disposed) setMessage(errorText(err));
                } finally {
                  setBusy(false);
                }
                return;
              }
              if (mode() === 'Sign in') await send('sign-in/email', { email, password });
              if (mode() === 'Create account')
                await send(
                  'sign-up/email',
                  { email, password, name: data.get('name'), callbackURL: location.origin + '/#/auth' },
                  token,
                );
              if (mode() === 'Verify email')
                await send('send-verification-email', {
                  email,
                  callbackURL: location.origin + '/#/auth',
                });
              if (mode() === 'Reset password')
                await send(
                  token ? 'reset-password' : 'request-password-reset',
                  token
                    ? { token, newPassword: password }
                    : { email, redirectTo: location.origin + '/#/auth' },
                );
            }}
          >
            <div class="auth-heading">
              <span class="auth-icon" aria-hidden="true">{icon[mode()]()}</span>
              <div>
                <h2>{mode()}</h2>
                <p class="muted">{intro[mode()]}</p>
              </div>
            </div>
            <Show when={mode() !== 'Redeem invitation'}>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autocomplete="email"
                  required={mode() !== 'Reset password' || !resetToken()}
                />
              </label>
            </Show>
            <Show when={mode() === 'Create account'}>
              <label>
                Name
                <input name="name" autocomplete="name" required maxLength={100} />
              </label>
            </Show>
            <Show
              when={mode() === 'Sign in' || mode() === 'Create account' || mode() === 'Reset password'}
            >
              <div class="auth-password">
                <label>
                  {mode() === 'Reset password' ? 'New password (when using a reset token)' : 'Password'}
                  <input
                    name="password"
                    type="password"
                    autocomplete={mode() === 'Sign in' ? 'current-password' : 'new-password'}
                    minlength={12}
                    maxlength={128}
                    required={mode() !== 'Reset password' || !!resetToken()}
                  />
                </label>
                <Show when={mode() === 'Sign in'}>
                  <button type="button" class="link-button auth-forgot" onClick={() => go('Reset password')}>
                    Forgot password?
                  </button>
                </Show>
              </div>
            </Show>
            <Show
              when={
                mode() === 'Create account' ||
                mode() === 'Redeem invitation' ||
                mode() === 'Reset password'
              }
            >
              <label>
                {mode() === 'Reset password'
                  ? 'Reset token (leave empty to request an email)'
                  : 'Invitation token'}
                <input
                  name="token"
                  type="password"
                  autocomplete="off"
                  maxLength={256}
                  value={mode() === 'Reset password' ? resetToken() : ''}
                  onInput={(e) => {
                    if (mode() === 'Reset password') setResetToken(e.currentTarget.value);
                  }}
                  required={mode() !== 'Reset password'}
                />
              </label>
            </Show>
            <Show
              when={
                (mode() === 'Create account' ||
                  mode() === 'Verify email' ||
                  mode() === 'Reset password') &&
                emailDown()
              }
            >
              <p class="notice">
                Email delivery is unavailable or unconfirmed. This action may not be completed yet.
              </p>
            </Show>
            <button class="primary auth-submit" disabled={busy() || identityDown()
              || (mode() === 'Redeem invitation' && !props.authenticated)
              || ((mode() === 'Create account' || mode() === 'Verify email' || (mode() === 'Reset password' && !resetToken())) && emailDown())} type="submit">
              <Show when={busy()}><Loader size="sm" /></Show>
              {busy()
                ? 'Please wait…'
                : mode() === 'Verify email'
                  ? 'Send verification email'
                  : mode() === 'Reset password'
                    ? 'Continue'
                    : mode()}
            </button>
          </form>
          </Show>
          <Show when={!props.authenticated}>
            <div class="auth-switch">
              <Show
                when={mode() !== 'Create account'}
                fallback={
                  <p>
                    Already have an account?{' '}
                    <button type="button" class="link-button" onClick={() => go('Sign in')}>Sign in</button>
                  </p>
                }
              >
                <p>
                  New to noti.school?{' '}
                  <button type="button" class="link-button" onClick={() => go('Create account')}>Create account</button>
                </p>
              </Show>
              <p class="auth-more">
                <For each={(['Redeem invitation', 'Verify email'] as const).filter((m) => m !== mode())}>
                  {(m, i) => (
                    <>
                      <Show when={i() > 0}><span aria-hidden="true"> · </span></Show>
                      <button type="button" class="link-button" onClick={() => go(m)}>
                        {m === 'Verify email' ? 'Resend verification email' : 'Have an invitation?'}
                      </button>
                    </>
                  )}
                </For>
              </p>
            </div>
          </Show>
        </div>
        <p role="status" class="auth-message">{message()}</p>
        <Show when={props.authenticated}>
          <details
            class="account-danger"
            open={dangerOpen()}
            onToggle={(e) => setDangerOpen(e.currentTarget.open)}
          >
            <summary>
              <Trash2 size={16} aria-hidden="true" />
              <span>Delete account</span>
              <ChevronDown size={16} class="account-chevron" aria-hidden="true" />
            </summary>
            <div class="account-danger-body">
              <p class="muted">
                This removes your account and personal conversations. A confirmation link is emailed first; nothing is deleted until you confirm it.
              </p>
              <button type="button" class="danger-quiet" disabled={busy() || emailDown()} onClick={() => {
                if (confirm('Delete your account and personal conversations? This cannot be undone after email confirmation.'))
                  void send('delete-user', deleteToken() ? { token: deleteToken() } : { callbackURL: location.origin + '/#/auth' });
              }}>{deleteToken() ? 'Confirm account deletion' : 'Request account deletion'}</button>
              <Show when={emailDown()}><p class="notice">Account deletion confirmation is unavailable while email is unavailable.</p></Show>
            </div>
          </details>
        </Show>
      </div>
    </section>
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
