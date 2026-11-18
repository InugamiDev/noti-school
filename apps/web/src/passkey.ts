import { z } from 'zod';
import { request } from './api';

// intent: passkey ceremonies against the Better Auth passkey plugin's wire format (@better-auth/passkey
// 1.7.6), using only the browser's native WebAuthn JSON helpers. A passkey signs in an existing
// verified account or is added to the signed-in one; nothing here creates an account, carries an
// invitation or grants a membership. The server decides who the credential belongs to.
// status: done | next: rehearse against the real auth worker and hardware authenticators
// confidence: medium (wire shapes read from the 1.7.6 package; exercised here only against the
// synthetic demo server with Chromium's virtual authenticator)
const base = '/api/auth/passkey';

const descriptor = z.looseObject({ id: z.string().min(1), type: z.string(), transports: z.array(z.string()).optional() });
const CreationOptions = z.looseObject({
  challenge: z.string().min(1),
  rp: z.looseObject({ name: z.string(), id: z.string().optional() }),
  user: z.looseObject({ id: z.string().min(1), name: z.string(), displayName: z.string() }),
  pubKeyCredParams: z.array(z.looseObject({ type: z.literal('public-key'), alg: z.number() })).min(1),
  excludeCredentials: z.array(descriptor).optional(),
});
const RequestOptions = z.looseObject({
  challenge: z.string().min(1),
  rpId: z.string().optional(),
  allowCredentials: z.array(descriptor).optional(),
});
// What the browser hands back, as produced by PublicKeyCredential.toJSON().
const Signed = z.looseObject({
  id: z.string().min(1),
  rawId: z.string().min(1),
  type: z.literal('public-key'),
  response: z.looseObject({ clientDataJSON: z.string().min(1) }),
});
const Passkey = z.looseObject({ id: z.string().min(1), name: z.string().nullish(), createdAt: z.string().nullish() });
const SignedIn = z.looseObject({ user: z.looseObject({ id: z.string().min(1) }) });

export type PasskeyItem = { id: string; name: string; createdAt: string | null };
const item = (row: z.infer<typeof Passkey>): PasskeyItem => ({
  id: row.id,
  name: row.name?.trim() ?? '',
  createdAt: row.createdAt ?? null,
});

/** A ceremony the browser ended without a result. `cancelled` is a choice, not a failure. */
export class PasskeyError extends Error {
  constructor(public reason: 'cancelled' | 'duplicate' | 'refused') {
    super(reason);
  }
}
function ceremonyError(error: unknown, registering: boolean) {
  if (!(error instanceof DOMException)) return error;
  // Dismissed, timed out, or replaced by a newer request.
  if (error.name === 'NotAllowedError' || error.name === 'AbortError') return new PasskeyError('cancelled');
  if (registering && error.name === 'InvalidStateError') return new PasskeyError('duplicate');
  return new PasskeyError('refused');
}

// The pieces probed before any ceremony: an older browser may have WebAuthn without the JSON helpers.
type WebAuthnProbe = {
  parseCreationOptionsFromJSON?: unknown;
  parseRequestOptionsFromJSON?: unknown;
  prototype?: { toJSON?: unknown };
};
/** True only when this browser can run both ceremonies with the native JSON helpers. */
export function passkeySupported() {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  const api: WebAuthnProbe | undefined = window.PublicKeyCredential;
  return (
    !!api &&
    typeof api.parseCreationOptionsFromJSON === 'function' &&
    typeof api.parseRequestOptionsFromJSON === 'function' &&
    typeof api.prototype?.toJSON === 'function' &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  );
}
/** Whether saved passkeys can be offered from the email field's autofill. */
export async function passkeyAutofillSupported() {
  if (!passkeySupported() || typeof PublicKeyCredential.isConditionalMediationAvailable !== 'function') return false;
  try {
    return await PublicKeyCredential.isConditionalMediationAvailable();
  } catch {
    return false; // Unknown support is treated as none; the button still works.
  }
}

// Browsers allow one WebAuthn request per page. Starting a ceremony ends the one before it, which
// is how the button takes over from a waiting autofill request.
let active: { controller: AbortController; autofill: boolean } | undefined;
function begin(autofill = false) {
  active?.controller.abort();
  const controller = new AbortController();
  active = { controller, autofill };
  return controller;
}
function end(controller: AbortController) {
  if (active?.controller === controller) active = undefined;
}
/** Ends a waiting autofill request when the view that asked for it goes away. */
export function stopPasskeyAutofill() {
  if (!active?.autofill) return;
  active.controller.abort();
  active = undefined;
}
function wire(credential: Credential | null) {
  if (!(credential instanceof PublicKeyCredential)) throw new PasskeyError('cancelled');
  // The plugin's own client sends the credential without its extension results; do the same.
  const { clientExtensionResults: _extensions, ...response } = Signed.parse(credential.toJSON());
  return response;
}

/** Signs in with a passkey already registered to an account. `autofill` waits for a pick from the email field. */
export async function signInWithPasskey(options: { autofill?: boolean } = {}) {
  const controller = begin(options.autofill === true);
  try {
    const json = await request(`${base}/generate-authenticate-options`, RequestOptions, { signal: controller.signal }).catch((error: unknown) => {
      // Autofill that could not be prepared is simply not offered; only a pressed button reports it.
      throw options.autofill ? new PasskeyError('cancelled') : error;
    });
    // Validated above; the cast only bridges zod's optional-property typing to the DOM type.
    const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(json as unknown as PublicKeyCredentialRequestOptionsJSON);
    const credential = await navigator.credentials.get({
      publicKey,
      signal: controller.signal,
      ...(options.autofill ? { mediation: 'conditional' as const } : {}),
    });
    const response = wire(credential);
    await request(`${base}/verify-authentication`, SignedIn, { method: 'POST', body: JSON.stringify({ response }) });
  } catch (error) {
    throw ceremonyError(error, false);
  } finally {
    end(controller);
  }
}

/** Adds a passkey to the signed-in account. The server requires a recent, verified session. */
export async function addPasskey(name: string) {
  const controller = begin();
  try {
    // The label travels only with the result: sent as a query it would replace the account name
    // the authenticator shows when it asks which passkey to use.
    const json = await request(`${base}/generate-register-options`, CreationOptions, { signal: controller.signal });
    const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(json as unknown as PublicKeyCredentialCreationOptionsJSON);
    const credential = await navigator.credentials.create({ publicKey, signal: controller.signal });
    const response = wire(credential);
    const label = name.trim();
    return item(
      await request(`${base}/verify-registration`, Passkey, {
        method: 'POST',
        body: JSON.stringify({ response, ...(label ? { name: label } : {}) }),
      }),
    );
  } catch (error) {
    throw ceremonyError(error, true);
  } finally {
    end(controller);
  }
}

export async function listPasskeys(signal?: AbortSignal) {
  const rows = await request(`${base}/list-user-passkeys`, z.array(Passkey), signal ? { signal } : {});
  return rows.map(item);
}
/** The reply carries nothing to rely on; callers reload the list to see what the server kept. */
export async function removePasskey(id: string) {
  await request(`${base}/delete-passkey`, z.unknown(), { method: 'POST', body: JSON.stringify({ id }) });
}
