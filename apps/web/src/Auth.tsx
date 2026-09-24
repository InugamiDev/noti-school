import { createSignal, Show, For } from 'solid-js';
import { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { request, post, errorText, takeAuthCallback } from './api';
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
export default function Auth(props: {
  callback?: ReturnType<typeof takeAuthCallback> | undefined;
  capabilities: z.infer<typeof Schemas.Capabilities> | undefined;
  authenticated: boolean;
  refresh: () => void;
}) {
  const callback = props.callback ?? takeAuthCallback(location.href);
  window.history.replaceState(null, '', callback.clean);
  const [resetToken, setResetToken] = createSignal(callback.token);
  const [deleteToken, setDeleteToken] = createSignal(callback.deletion);
  const [googleInvitation, setGoogleInvitation] = createSignal('');
  const [mode, setMode] = createSignal<(typeof modes)[number]>(
    resetToken() ? 'Reset password' : 'Sign in',
  );
  const [busy, setBusy] = createSignal(false),
    [message, setMessage] = createSignal(callback.error ? 'Sign-in or recovery could not be completed. Please try again.' : '');
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
      props.refresh();
    } catch (e) {
      const confirmingDeletion = path === 'delete-user' && !!deleteToken();
      if (confirmingDeletion) setDeleteToken('');
      setMessage(errorText(e) + (confirmingDeletion ? ' Request a new email confirmation before retrying deletion.' : ''));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="auth">
      <h1 tabIndex={-1}>{props.authenticated ? 'Your account' : 'Welcome to noti.school'}</h1>
      <p class="muted">
        Access the collections shared with you. Pilot membership is by invitation.
      </p>
      <Show when={props.authenticated}>
        <button onClick={() => void send('sign-out', {})}>Sign out</button>
        <a class="text-link" href="#/">
          Return to your question
        </a>
        <button disabled={busy() || props.capabilities?.email.state !== 'available'} onClick={() => {
          if (confirm('Delete your account and personal conversations? This cannot be undone after email confirmation.'))
            void send('delete-user', deleteToken() ? { token: deleteToken() } : { callbackURL: location.origin + '/#/auth' });
        }}>{deleteToken() ? 'Confirm account deletion' : 'Request account deletion'}</button>
        <Show when={props.capabilities?.email.state !== 'available'}><p class="notice">Account deletion confirmation is unavailable while email is unavailable.</p></Show>
      </Show>
      <Show when={deleteToken() && !props.authenticated}><p class="notice">Sign in to the account before confirming deletion. Keep this tab open.</p></Show>
      <div class="tabs" role="group" aria-label="Account actions">
        <For each={modes}>
          {(m) => (
            <button
              aria-pressed={mode() === m}
              onClick={() => {
                setMode(m);
                setMessage('');
              }}
            >
              {m}
            </button>
          )}
        </For>
      </div>
      <Show when={props.capabilities?.identity.state !== 'available'}>
        <p class="notice">
          Sign-in availability is not confirmed. Your question draft is kept in this tab.
        </p>
      </Show>
      <form
        class="stack"
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
              await post('/api/auth/invitations/redeem', 'Membership', { token });
              setMessage('Invitation redeemed. Your collection access has been updated.');
              props.refresh();
            } catch (err) {
              setMessage(errorText(err));
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
        <h2>{mode()}</h2>
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
            props.capabilities?.email.state !== 'available'
          }
        >
          <p class="notice">
            Email delivery is unavailable or unconfirmed. This action may not be completed yet.
          </p>
        </Show>
        <button class="primary" disabled={busy() || props.capabilities?.identity.state !== 'available'
          || (mode() === 'Redeem invitation' && !props.authenticated)
          || ((mode() === 'Create account' || mode() === 'Verify email' || (mode() === 'Reset password' && !resetToken())) && props.capabilities?.email.state !== 'available')} type="submit">
          {busy()
            ? 'Please wait…'
            : mode() === 'Verify email'
              ? 'Send verification email'
              : mode() === 'Reset password'
                ? 'Continue'
                : mode()}
        </button>
      </form>
      <Show when={mode() === 'Sign in'}>
        <label class="stack">
          Invitation token (new Google accounts)
          <input
            type="password"
            autocomplete="off"
            maxLength={256}
            value={googleInvitation()}
            onInput={(e) => setGoogleInvitation(e.currentTarget.value)}
          />
        </label>
        <button
          class="google"
          disabled={busy() || props.capabilities?.google.state !== 'available'}
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
        </button>
        <Show when={props.capabilities?.google.state !== 'available'}>
          <p class="muted">Google sign-in is not available yet.</p>
        </Show>
      </Show>
      <p role="status">{message()}</p>
    </section>
  );
}
