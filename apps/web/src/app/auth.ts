// intent: account form rules (which fields each mode shows and requires, inline error text) as pure functions, so the
//         TextField errors replace the old native constraint bubbles without changing what may be submitted.
// status: done
// next: keep the limits in step with the identity service; the server still validates every request.
// confidence: high
export const authModes = ['Sign in', 'Create account', 'Redeem invitation', 'Verify email', 'Reset password'] as const;
export type AuthMode = (typeof authModes)[number];

export interface AuthValues {
  email: string;
  name: string;
  password: string;
  token: string;
}

export type AuthField = keyof AuthValues;
export type AuthErrors = Partial<Record<AuthField, string>>;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 100;
export const TOKEN_MAX = 256;

/** Fields rendered for a mode, in form order. */
export function authFields(mode: AuthMode): AuthField[] {
  switch (mode) {
    case 'Sign in':
      return ['email', 'password'];
    case 'Create account':
      return ['email', 'name', 'password', 'token'];
    case 'Redeem invitation':
      return ['token'];
    case 'Verify email':
      return ['email'];
    case 'Reset password':
      return ['email', 'password', 'token'];
  }
}

// Same shape test as a native type="email" field: one @ with text on both sides and no spaces.
const EMAIL = /^[^\s@]+@[^\s@]+$/;

/**
 * Inline errors for the visible fields. Reset password needs an email to request a link, or a token plus a new
 * password to finish the reset; the token field doubles as the reset token.
 */
export function authErrors(mode: AuthMode, values: AuthValues, resetToken: string): AuthErrors {
  const errors: AuthErrors = {};
  const fields = authFields(mode);
  const resetting = mode === 'Reset password' && !!resetToken;
  if (fields.includes('email')) {
    const required = mode !== 'Reset password' || !resetting;
    if (required && !values.email.trim()) errors.email = 'Enter your email address.';
    else if (values.email.trim() && !EMAIL.test(values.email.trim())) errors.email = 'Enter a complete email address.';
  }
  if (fields.includes('name')) {
    if (!values.name.trim()) errors.name = 'Enter your name.';
    else if ([...values.name].length > NAME_MAX) errors.name = `Use at most ${NAME_MAX} characters.`;
  }
  if (fields.includes('password')) {
    const required = mode !== 'Reset password' || resetting;
    const length = [...values.password].length;
    if (required && !length) errors.password = 'Enter a password.';
    else if (length && (length < PASSWORD_MIN || length > PASSWORD_MAX))
      errors.password = `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
  }
  if (fields.includes('token')) {
    const value = mode === 'Reset password' ? resetToken : values.token;
    if (mode !== 'Reset password' && !value) errors.token = 'Enter your invitation token.';
    else if (value.length > TOKEN_MAX) errors.token = `Use at most ${TOKEN_MAX} characters.`;
  }
  return errors;
}
