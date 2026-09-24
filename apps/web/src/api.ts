import { z } from 'zod';
import { ApiError, Schemas, validateAnswer } from '@noti/contracts';
import registry from '../../../docs/contracts/endpoints.json';

// intent: enforce the frozen public boundary; status: implemented; next: integrate real services.
type SchemaName = keyof typeof Schemas;
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
  try {
    response = await fetch(path, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000),
      headers,
      credentials: 'same-origin',
      redirect: 'error',
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new RequestError('Connection unavailable. Your draft is safe; please try again.');
  }
  if (response.status === 204 && schema === null) return undefined as T;
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new RequestError('This service is unavailable. Please try again later.', response.status);
  }
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
export function saveDraft(value: string) {
  try {
    sessionStorage.setItem('noti.draft', value);
  } catch {
    /* Storage is optional. */
  }
}
export function loadDraft() {
  try {
    return sessionStorage.getItem('noti.draft') || '';
  } catch {
    return '';
  }
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
