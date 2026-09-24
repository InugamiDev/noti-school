import { createResource, type Resource } from 'solid-js';

// Resource failures are rendered inline; reading an unavailable service must not tear down the app.
export const createRemoteResource = ((...args: unknown[]) => {
  const invoke = createResource as (...input: unknown[]) => [Resource<unknown>, unknown];
  const [resource, controls] = invoke(...args);
  const safe = new Proxy(resource, {
    apply(target) {
      return target.error ? undefined : target();
    },
  });
  return [safe, controls];
}) as typeof createResource;
