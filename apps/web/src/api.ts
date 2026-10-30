import type { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import registry from '../../../docs/contracts/endpoints.json';

// intent: enforce the frozen public boundary; status: implemented; next: integrate real services.
type SchemaName = keyof typeof Schemas;
type Contracts = typeof import('@noti/contracts');
let contracts: Promise<Contracts> | undefined;
let loaded: Contracts | undefined;
/** Contract schemas (and zod) load with the first API request, in parallel with it, not in the initial bundle. */
// A failed chunk fetch (flaky network, or a deploy that removed the old hashed file) is not cached here, but browsers keep a
// failed module in their module map for the page's lifetime, so callers tell the user to reload rather than promise a retry.
export const loadContracts = () =>
  (contracts ??= import('@noti/contracts').then(
    module => (loaded = module),
    (error: unknown) => {
      contracts = undefined;
      throw error;
    },
  ));
let scopeController = new AbortController();
export const requestScope = () => scopeController.signal;
export function invalidateRequests() {
  scopeController.abort();
  scopeController = new AbortController();
}
export class RequestError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = 'unavailable',
  ) {
    super(message);
  }
}
export function endpoint(template: string, params: Record<string, string> = {}) {
  if (!registry.endpoints.some((e) => e.path === template && !e.scope.startsWith('internal')))
    throw new Error('Unknown public endpoint');
  return template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = params[key];
    if (!value) throw new Error('Missing endpoint parameter');
    return encodeURIComponent(value);
  });
}
/** `schema` is a zod schema or the name of a contract schema, resolved once the contracts have loaded. */
export async function request<T>(
  path: string,
  schema: z.ZodType<T> | SchemaName | null,
  init: RequestInit = {},
): Promise<T> {
  if (!path.startsWith('/api/') || path.startsWith('//'))
    throw new Error('Same-origin API required');
  const headers = new Headers(init.headers);
  if (init.method && init.method !== 'GET') headers.set('X-Noti-CSRF', '1');
  if (init.body && !(init.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  let response: Response;
  const owned = !['/api/v1/me', '/api/v1/capabilities', '/api/v1/institutions'].includes(path);
  const scope = scopeController.signal;
  const loading = loadContracts().catch(() => {
    throw new RequestError('Part of the app did not download. Check your connection, then reload the page.');
  });
  loading.catch(() => undefined); // awaited below; this only stops an early fetch failure leaving it unhandled
  // Asking loads the contracts first (App ask), so the answer request still starts synchronously.
  const timeout = path === '/api/v1/answers' && init.method === 'POST' ? (loaded ?? (await loading)).ANSWER_WAIT_MS : 45000;
  const signal = AbortSignal.any([AbortSignal.timeout(timeout), ...(init.signal ? [init.signal] : []), ...(owned ? [scope] : [])]);
  try {
    response = await fetch(path, {
      ...init,
      signal,
      headers,
      credentials: 'same-origin',
      redirect: 'error',
    });
  } catch (error) {
    if (init.signal?.aborted || (owned && scope.aborted)) throw error;
    throw new RequestError(path === '/api/v1/answers'
      ? 'Stopped waiting for a response. Processing may continue. Submit the same question to check the same operation.'
      : 'Connection unavailable. Please try again.');
  }
  if (response.status === 204 && schema === null) return undefined as T;
  const { ApiError, Schemas } = await loading;
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new RequestError('This service is unavailable. Please try again later.', response.status);
  }
  signal.throwIfAborted();
  if (!response.ok) {
    const parsed = ApiError.safeParse(value);
    const code = parsed.success ? parsed.data.error.code : 'unavailable';
    const messages: Record<string, string> = {
      unauthenticated: 'Sign in to continue. Your draft is safe.',
      forbidden: 'Your account does not have access to this collection.',
      provider_unavailable: 'Answers are temporarily unavailable.',
      budget_exhausted: 'Answers are paused for this month. Please browse the source collection.',
      conflict: 'This item changed or is already being processed. Refresh before trying again.',
      invalid_request: 'Please check the form and try again.',
    };
    throw new RequestError(
      messages[code] || 'This action is unavailable. Please try again later.',
      response.status,
      code,
    );
  }
  if (!schema) return undefined as T;
  const result = (typeof schema === 'string' ? (Schemas[schema] as unknown as z.ZodType<T>) : schema).safeParse(value);
  if (!result.success)
    throw new RequestError('The response could not be read safely. Please try again later.');
  return result.data;
}
export function get<N extends SchemaName>(path: string, name: N, signal?: AbortSignal) {
  return request<z.infer<(typeof Schemas)[N]>>(path, name, signal ? { signal } : {});
}
export function post<N extends SchemaName>(
  path: string,
  name: N,
  body: unknown,
  extra: RequestInit = {},
) {
  return request<z.infer<(typeof Schemas)[N]>>(path, name, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
    ...extra,
  });
}
export function safeLink(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}
/** Validates an answer against its own evidence (throws on mismatch). */
export async function readAnswer(value: unknown) {
  return (await loadContracts()).validateAnswer(value);
}
export function errorText(value: unknown) {
  return value instanceof RequestError
    ? value.message
    : 'This action could not be completed. Please try again.';
}
export function saveDraft(value: string, owner = 'anonymous', conversation?: { id: string; institution: string }) {
  try {
    sessionStorage.setItem('noti.owned-draft', JSON.stringify({ owner, value, conversation }));
  } catch {
    /* Storage is optional. */
  }
}
export function loadDraftConversation(owner: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('noti.owned-draft') || 'null');
    // Read synchronously at start-up, before the contract schemas load; asking validates the id again (AskRequest).
    const conversation: unknown = saved?.conversation;
    if (saved?.owner !== owner || !conversation || typeof conversation !== 'object') return undefined;
    const { id, institution } = conversation as Record<string, unknown>;
    return isUuid(id) && isUuid(institution) ? { id, institution } : undefined;
  } catch { return undefined; }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
export function loadDraft(owner = 'anonymous', anonymousOwner?: string) {
  try {
    sessionStorage.removeItem('noti.draft'); // Unscoped legacy text cannot establish ownership.
    const saved = JSON.parse(sessionStorage.getItem('noti.owned-draft') || 'null');
    return saved && (saved.owner === owner || (anonymousOwner && saved.owner === anonymousOwner)) && typeof saved.value === 'string' ? saved.value : '';
  } catch {
    return '';
  }
}

export function clearOwnedStorage() {
  try { for (const key of ['noti.draft', 'noti.owned-draft', 'noti.operations']) sessionStorage.removeItem(key); } catch { /* Optional tab storage. */ }
}
// Persist fingerprints, never question text. Retain ambiguous identities until the owner changes.
const operations = new Map<string, string>();
export function clearOperations() { operations.clear(); clearOwnedStorage(); }
export function retainOperations(owner: string) {
  try {
    const saved = JSON.parse(sessionStorage.getItem('noti.operations') || 'null');
    if (saved?.owner !== owner) { operations.clear(); sessionStorage.removeItem('noti.operations'); }
  } catch { operations.clear(); }
}
export async function operationKey(owner: string, payload: unknown, signal?: AbortSignal) {
  const scope = scopeController.signal;
  const bytes = new TextEncoder().encode(JSON.stringify([owner, payload]));
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  scope.throwIfAborted(); signal?.throwIfAborted();
  let saved: Record<string, string> = {};
  try {
    const stored = JSON.parse(sessionStorage.getItem('noti.operations') || '{}');
    if (stored.owner === owner && stored.keys && typeof stored.keys === 'object') saved = stored.keys;
  } catch { /* Optional tab storage. */ }
  const key = operations.get(fingerprint) || saved[fingerprint] || crypto.randomUUID();
  operations.set(fingerprint, key);
  try { sessionStorage.setItem('noti.operations', JSON.stringify({ owner, keys: { ...saved, [fingerprint]: key } })); } catch { /* Memory still preserves explicit retries. */ }
  return key;
}

// Consume callbacks synchronously before rendering; never persist credential-bearing query strings.
export function takeAuthCallback(href: string) {
  const url = new URL(href);
  const [route = '/auth', query = ''] = url.hash.slice(1).split('?');
  const hash = new URLSearchParams(query);
  const token = hash.get('token') ?? url.searchParams.get('token') ?? '';
  const deletion = hash.get('delete_token') ?? url.searchParams.get('delete_token') ?? '';
  const error = hash.has('error') || url.searchParams.has('error') || route === '/auth/error';
  for (const key of ['token', 'delete_token', 'error', 'error_description']) { hash.delete(key); url.searchParams.delete(key); }
  url.hash = route + (hash.size ? '?' + hash.toString() : '');
  return { token: token.length <= 256 ? token : '', deletion: deletion.length <= 256 ? deletion : '', error, clean: url.pathname + url.search + url.hash };
}
