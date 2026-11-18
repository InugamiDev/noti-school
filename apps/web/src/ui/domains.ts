// intent: one place that turns what an administrator typed into the host name the API stores.
// Unicode names (trường.example) become their ASCII form through the URL parser, the same IDNA
// mapping browsers and the server use. The server stays the authority; this only refuses input
// that is plainly not a bare host. status: done | next: none | confidence: high

// One or more dot-separated labels and a top-level name: a host, never a URL, path or wildcard.
const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
// Characters that make the text a URL, a path, a port, credentials or an escape rather than a host.
const notBareHost = /[\s/\\:@?#%[\]]/;

/** Lowercase ASCII host for a typed domain, or undefined when it is not a bare host name. */
export function asciiHost(typed: string): string | undefined {
  if (!typed || notBareHost.test(typed)) return undefined;
  try {
    const host = new URL(`https://${typed}`).hostname;
    return hostname.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

/** Typed lines or comma-separated names as unique ASCII hosts; undefined when any entry is not a host. */
export function parseDomains(typed: string): string[] | undefined {
  const hosts = typed.split(/[\s,]+/).filter(Boolean).map(asciiHost);
  return hosts.every((host): host is string => host !== undefined) ? [...new Set(hosts)] : undefined;
}
