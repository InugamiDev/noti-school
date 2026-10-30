// intent: app-wide toasts without solid-sonner in the initial bundle. The host loads when the browser is idle or with
//         the first toast; sonner replays queued toasts to a late subscriber, so nothing shown early is lost.
// status: done
// next: mount <Toaster /> once near the app root; call toast() from anywhere.
// confidence: high
import { createSignal, lazy, onCleanup, onMount, Show } from 'solid-js';
import { whenIdle } from './lib/idle';

export type ToastTone = 'success' | 'info' | 'error';

let host: Promise<typeof import('./ToasterHost')> | undefined;
const loadHost = () =>
  (host ??= import('./ToasterHost').catch((error: unknown) => {
    host = undefined; // retry with the next toast
    throw error;
  }));
// A failed host renders nothing rather than throwing into the page's error boundary.
const Host = lazy(() =>
  loadHost().then(
    module => ({ default: module.ToasterHost }),
    () => ({ default: () => null }),
  ),
);
const [wanted, setWanted] = createSignal(false);

/** Toast host; render once. Sonner's container is an aria-live="polite" region. */
export function Toaster() {
  onMount(() => onCleanup(whenIdle(() => setWanted(true))));
  return (
    <Show when={wanted()}>
      <Host />
    </Show>
  );
}

/** Shows a short confirmation; tone picks the icon (success check, info, error triangle). */
export function toast(message: string, tone: ToastTone = 'success'): void {
  setWanted(true);
  loadHost().then(
    module => module.toast(message, tone),
    () => undefined,
  );
}
