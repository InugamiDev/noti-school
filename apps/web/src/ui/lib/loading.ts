// intent: delayed skeleton visibility. A skeleton appears only when loading outlasts `delay`, and once shown stays at
//         least `minVisible`, so fast responses never flash a placeholder and slow ones never flicker.
// status: done
// next: `since` lets a remounted region (keyed on access scope) keep a skeleton the earlier wait already showed.
// confidence: high; the timer is framework-free and unit-tested with fake timers in tests/ui-loading.test.ts
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';

export interface DelayedLoadingOptions {
  /** Milliseconds of loading before the skeleton appears; defaults to 150. */
  delay?: number;
  /** Minimum milliseconds a shown skeleton stays; defaults to 400. */
  minVisible?: number;
  /**
   * Timestamp (same clock as `now`) when the wait began, if before this region mounted. A wait that already outlasted
   * `delay` shows the skeleton at once (the earlier region showed it too); a shorter one gets the full delay again.
   */
  since?: number;
  /** Clock; defaults to Date.now. */
  now?: () => number;
}

export interface LoadingTimer {
  /** Report the current loading state; call on every change. */
  update(loading: boolean): void;
  /** Whether the skeleton is currently shown. */
  shown(): boolean;
  /** Cancels pending timers; no further onChange calls happen. */
  dispose(): void;
}

/** Framework-free state machine behind createDelayedLoading; `onChange` fires only when visibility flips. */
export function createLoadingTimer(onChange: (shown: boolean) => void, options: DelayedLoadingOptions = {}): LoadingTimer {
  const delay = options.delay ?? 150;
  const minVisible = options.minVisible ?? 400;
  const now = options.now ?? Date.now;
  let since = options.since;
  let shown = false;
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const clear = () => {
    if (showTimer !== undefined) clearTimeout(showTimer);
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    showTimer = hideTimer = undefined;
  };
  const set = (next: boolean) => {
    clear();
    if (disposed || next === shown) return;
    shown = next;
    if (next) shownAt = now();
    onChange(next);
  };
  return {
    update(loading) {
      if (disposed) return;
      if (loading) {
        if (hideTimer !== undefined) {
          clearTimeout(hideTimer);
          hideTimer = undefined;
        }
        if (shown || showTimer !== undefined) return;
        const waited = since !== undefined && now() - since >= delay;
        since = undefined;
        if (waited) set(true);
        else showTimer = setTimeout(() => set(true), delay);
        return;
      }
      since = undefined;
      if (showTimer !== undefined) {
        clearTimeout(showTimer);
        showTimer = undefined;
      }
      if (!shown || hideTimer !== undefined) return;
      const remaining = minVisible - (now() - shownAt);
      if (remaining <= 0) set(false);
      else hideTimer = setTimeout(() => set(false), remaining);
    },
    shown: () => shown,
    dispose() {
      disposed = true;
      clear();
    },
  };
}

/** Solid accessor that is true while a skeleton should be visible for `loading`; timers stop when the owner is disposed. */
export function createDelayedLoading(loading: () => boolean, options: DelayedLoadingOptions = {}): Accessor<boolean> {
  const [shown, setShown] = createSignal(false);
  const timer = createLoadingTimer(setShown, options);
  // Runs synchronously at creation, so a wait that already outlasted `delay` (see `since`) shows on the first render.
  timer.update(loading());
  createEffect(() => timer.update(loading()));
  onCleanup(() => timer.dispose());
  return shown;
}
