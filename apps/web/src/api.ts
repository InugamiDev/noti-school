import { z } from 'zod';
import { ApiError, Schemas, validateAnswer, ANSWER_WAIT_MS } from '@noti/contracts';
import registry from '../../../docs/contracts/endpoints.json';

// intent: enforce the frozen public boundary; status: implemented; next: integrate real services.
type SchemaName = keyof typeof Schemas;
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
export async function request<T>(
  path: string,
  schema: z.ZodType<T> | null,
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
  const timeout = path === '/api/v1/answers' && init.method === 'POST' ? ANSWER_WAIT_MS : 45000;
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
      provider_unavailable:
        'Answers are temporarily unavailable. You can still browse accessible sources.',
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
  const result = schema.safeParse(value);
  if (!result.success)
    throw new RequestError('The response could not be read safely. Please try again later.');
  return result.data;
}
export function get<N extends SchemaName>(path: string, name: N, signal?: AbortSignal) {
  return request(
    path,
    Schemas[name] as unknown as z.ZodType<z.infer<(typeof Schemas)[N]>>,
    signal ? { signal } : {},
  );
}
export function post<N extends SchemaName>(
  path: string,
  name: N,
  body: unknown,
  extra: RequestInit = {},
) {
  return request(path, Schemas[name] as unknown as z.ZodType<z.infer<(typeof Schemas)[N]>>, {
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
export const readAnswer = validateAnswer;
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
    const conversation = z.object({ id: z.uuid(), institution: z.uuid() }).safeParse(saved?.conversation);
    return saved?.owner === owner && conversation.success ? conversation.data : undefined;
  } catch { return undefined; }
}
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
