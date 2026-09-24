import { createComputed, createMemo, createResource, createSignal, untrack, type Resource } from 'solid-js';
import { invalidateRequests } from './api';

export const [accessScope, setScope] = createSignal('initial');
export function setAccessScope(scope: string) {
  if (scope === accessScope()) return;
  invalidateRequests();
  setScope(scope);
}

// Resource failures are rendered inline; reading an unavailable service must not tear down the app.
export const createRemoteResource = ((...args: unknown[]) => {
  // Keyed resources must never expose Solid's retained previous value across scope/route changes.
  if (args.length > 1 && typeof args[1] === 'function') {
    const source = args[0] as () => unknown;
    const fetcher = args[1] as (key: unknown, info: unknown) => unknown;
    const key = createMemo(() => {
      if (accessScope() === 'initial') return false;
      const value = source();
      return value ? { value, scope: accessScope() } : false;
    });
    const [resource, controls] = createResource(key, async (current, info) => ({ key: current, value: await fetcher(current.value, info) }));
    createComputed(() => { key(); untrack(() => controls.mutate(undefined)); });
    const read = () => {
      if (resource.error) return undefined;
      const result = resource() as { key: unknown; value: unknown } | undefined;
      return result?.key === key() ? result.value : undefined;
    };
    return [new Proxy(read, { get(_, prop) { return prop === 'latest' ? read() : Reflect.get(resource, prop); } }), controls];
  }
  const invoke = createResource as (...input: unknown[]) => [Resource<unknown>, unknown];
  const [resource, controls] = invoke(...args);
  const safe = new Proxy(resource, {
    apply(target) {
      return target.error ? undefined : target();
    },
  });
  return [safe, controls];
}) as typeof createResource;
