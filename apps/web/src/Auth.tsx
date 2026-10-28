// intent: account page on the Clay kit: mode tabs, TextField inline errors, provider availability notices, loading
//         buttons. Requests, bodies, headers, callback handling and messages are unchanged from the previous form.
// status: done
// next: field rules live in app/auth.ts; keep both in step with the identity service.
// confidence: high
import { createSignal, Show, onCleanup } from 'solid-js';
import { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { CircleAlert, LogOut, Trash2 } from 'lucide-solid';
import { request, post, errorText, takeAuthCallback } from './api';
import { Button, cx, Tabs, TextField } from './ui';
import {
  authErrors,
  authFields,
  authModes,
  type AuthErrors,
  type AuthField,
  type AuthMode,
} from './app/auth';
import page from './app/Page.module.scss';
import styles from './app/Auth.module.scss';
const nativeSuccess = z.union([
  z.object({ status: z.literal(true) }),
  z.object({ success: z.literal(true) }),
  z.object({ user: z.object({ id: z.string() }) }),
  z.object({ url: z.url(), redirect: z.boolean().optional() }),
]);
export default function Auth(props: {
  callback?: ReturnType<typeof takeAuthCallback> | undefined;
  capabilities: z.infer<typeof Schemas.Capabilities> | undefined;
  authenticated: boolean;
  refresh: () => void;
  signedOut: () => void;
}) {
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const callback = props.callback ?? takeAuthCallback(location.href);
  window.history.replaceState(null, '', callback.clean);
  const [resetToken, setResetToken] = createSignal(callback.token);
  const [deleteToken, setDeleteToken] = createSignal(callback.deletion);
  const [googleInvitation, setGoogleInvitation] = createSignal('');
  const [mode, setMode] = createSignal<AuthMode>(
    resetToken() ? 'Reset password' : 'Sign in',
  );
  const [busy, setBusy] = createSignal(false),
    [message, setMessage] = createSignal(callback.error ? 'Sign-in or recovery could not be completed. Please try again.' : '');
  const [email, setEmail] = createSignal(''),
    [name, setName] = createSignal(''),
    [password, setPassword] = createSignal(''),
    [token, setToken] = createSignal('');
  const [errors, setErrors] = createSignal<AuthErrors>({});
  const inputs: Partial<Record<AuthField, HTMLInputElement>> = {};
  const identityReady = () => props.capabilities?.identity.state === 'available';
  const emailReady = () => props.capabilities?.email.state === 'available';
  const googleReady = () => props.capabilities?.google.state === 'available';
  // Editing a field clears only its own error, so the rest stay visible until the next submit.
  const edit = (field: AuthField, set: (value: string) => void) => (value: string) => {
    set(value);
    if (errors()[field]) setErrors({ ...errors(), [field]: undefined });
  };
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
      if (path === 'delete-user') setDeleteToken('');
      if (ended) props.signedOut();
      props.refresh();
    } catch (e) {
      if (disposed) return;
      const confirmingDeletion = path === 'delete-user' && !!deleteToken();
      if (confirmingDeletion) setDeleteToken('');
      setMessage(errorText(e) + (confirmingDeletion ? ' Request a new email confirmation before retrying deletion.' : ''));
    } finally {
      if (!disposed) setBusy(false);
    }
  }
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy()) return;
    const found = authErrors(mode(), { email: email(), name: name(), password: password(), token: token() }, resetToken());
    setErrors(found);
    const first = authFields(mode()).find((field) => found[field]);
    if (first) {
      inputs[first]?.focus();
      return;
    }
    if (mode() === 'Redeem invitation') {
      setBusy(true);
      try {
        await post('/api/auth/invitations/redeem', 'Membership', { token: token() });
        if (disposed) return;
        setMessage('Invitation redeemed. Your collection access has been updated.');
        props.refresh();
      } catch (err) {
        if (!disposed) setMessage(errorText(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (mode() === 'Sign in') await send('sign-in/email', { email: email(), password: password() });
    if (mode() === 'Create account')
      await send(
        'sign-up/email',
        { email: email(), password: password(), name: name(), callbackURL: location.origin + '/#/auth' },
        token(),
      );
    if (mode() === 'Verify email')
      await send('send-verification-email', {
        email: email(),
        callbackURL: location.origin + '/#/auth',
      });
    if (mode() === 'Reset password')
      await send(
        resetToken() ? 'reset-password' : 'request-password-reset',
        resetToken()
          ? { token: resetToken(), newPassword: password() }
          : { email: email(), redirectTo: location.origin + '/#/auth' },
      );
  }
  const needsEmail = () =>
    mode() === 'Create account' || mode() === 'Verify email' || (mode() === 'Reset password' && !resetToken());
  const blocked = () =>
    busy() ||
    !identityReady() ||
    (mode() === 'Redeem invitation' && !props.authenticated) ||
    (needsEmail() && !emailReady());
  const field = (key: AuthField) => authFields(mode()).includes(key);
  const form = () => (
    <form class={page.form} novalidate onSubmit={(e) => void submit(e)}>
      <h2 class={page.h3}>{mode()}</h2>
      <Show when={field('email')}>
        <TextField
          label="Email"
          name="email"
          type="email"
          autocomplete="email"
          value={email()}
          onChange={edit('email', setEmail)}
          error={errors().email}
          required={mode() !== 'Reset password' || !resetToken()}
          inputRef={(el) => (inputs.email = el)}
        />
      </Show>
      <Show when={field('name')}>
        <TextField
          label="Name"
          name="name"
          autocomplete="name"
          value={name()}
          onChange={edit('name', setName)}
          error={errors().name}
          required
          inputRef={(el) => (inputs.name = el)}
        />
      </Show>
      <Show when={field('password')}>
        <TextField
          label={mode() === 'Reset password' ? 'New password (when using a reset token)' : 'Password'}
          name="password"
          type="password"
          autocomplete={mode() === 'Sign in' ? 'current-password' : 'new-password'}
          hint={mode() === 'Sign in' ? undefined : '12 to 128 characters.'}
          value={password()}
          onChange={edit('password', setPassword)}
          error={errors().password}
          required={mode() !== 'Reset password' || !!resetToken()}
          inputRef={(el) => (inputs.password = el)}
        />
      </Show>
      <Show when={field('token')}>
        <TextField
          label={mode() === 'Reset password' ? 'Reset token (leave empty to request an email)' : 'Invitation token'}
          name="token"
          type="password"
          autocomplete="off"
          value={mode() === 'Reset password' ? resetToken() : token()}
          onChange={edit('token', mode() === 'Reset password' ? setResetToken : setToken)}
          error={errors().token}
          required={mode() !== 'Reset password'}
          inputRef={(el) => (inputs.token = el)}
        />
      </Show>
      <Show when={needsEmail() && !emailReady()}>
        <p class={page.notice}>
          <CircleAlert size={18} aria-hidden="true" />
          Email delivery is unavailable or unconfirmed. This action may not be completed yet.
        </p>
      </Show>
      <Show when={mode() === 'Redeem invitation' && !props.authenticated}>
        <p class={page.small}>Sign in first, then redeem the invitation for your account.</p>
      </Show>
      <Button variant="primary" type="submit" class={page.submit} disabled={blocked()} loading={busy()} loadingLabel="Please wait">
        {mode() === 'Verify email'
          ? 'Send verification email'
          : mode() === 'Reset password'
            ? 'Continue'
            : mode()}
      </Button>
    </form>
  );
  return (
    <section class={page.narrow}>
      <h1 class={page.title} tabIndex={-1}>{props.authenticated ? 'Your account' : 'Welcome to noti.school'}</h1>
      <p class={page.lede}>
        Access the collections shared with you. Pilot membership is by invitation.
      </p>
      <Show when={props.authenticated}>
        <div class={cx(page.card, styles.account)}>
          <div class={page.actions}>
            <Button onClick={() => void send('sign-out', {})}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
            <Button variant="ghost" href="#/">
              Return to your question
            </Button>
          </div>
          <div class={styles.danger}>
            <Button variant="ghost" disabled={busy() || !emailReady()} onClick={() => {
              if (confirm('Delete your account and personal conversations? This cannot be undone after email confirmation.'))
                void send('delete-user', deleteToken() ? { token: deleteToken() } : { callbackURL: location.origin + '/#/auth' });
            }}>
              <Trash2 aria-hidden="true" />
              {deleteToken() ? 'Confirm account deletion' : 'Request account deletion'}
            </Button>
            <Show when={!emailReady()}>
              <p class={page.small}>Account deletion confirmation is unavailable while email is unavailable.</p>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={deleteToken() && !props.authenticated}>
        <p class={page.notice}>
          <CircleAlert size={18} aria-hidden="true" />
          Sign in to the account before confirming deletion. Keep this tab open.
        </p>
      </Show>
      <Show when={!identityReady()}>
        <p class={cx(page.notice, page.error)}>
          <CircleAlert size={18} aria-hidden="true" />
          Sign-in availability is not confirmed. Your question draft is kept in this tab.
        </p>
      </Show>
      <div class={cx(page.card, styles.panel)}>
        <Tabs
          aria-label="Account actions"
          class={styles.tabs}
          value={mode()}
          onChange={(value) => {
            setMode(value as AuthMode);
            setErrors({});
            setMessage('');
          }}
          items={authModes.map((m) => ({
            value: m,
            label: m,
            get content() {
              return form();
            },
          }))}
        />
        <Show when={mode() === 'Sign in'}>
          <div class={styles.google}>
            <p class={styles.or}>
              <span>or</span>
            </p>
            <label class={page.field} for="google-invitation">
              Invitation token (new Google accounts)
            </label>
            <input
              id="google-invitation"
              class={page.input}
              type="password"
              autocomplete="off"
              maxLength={256}
              value={googleInvitation()}
              onInput={(e) => setGoogleInvitation(e.currentTarget.value)}
            />
            <Button
              class={styles.googleButton}
              disabled={busy() || !googleReady()}
              onClick={async () => {
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
              }}
            >
              Continue with Google
            </Button>
            <Show when={!googleReady()}>
              <p class={page.small}>Google sign-in is not available yet.</p>
            </Show>
          </div>
        </Show>
      </div>
      <p role="status" class={styles.message}>{message()}</p>
    </section>
  );
}
