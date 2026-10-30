const IDLE_TIMEOUT_MS = 1200;
const IDLE_FALLBACK_MS = 200;

/** Runs `run` when the browser is idle (at most IDLE_TIMEOUT_MS later); returns a cancel function. */
export function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
}
