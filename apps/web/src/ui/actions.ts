import { createSignal, onCleanup } from 'solid-js';
import { errorText } from '../api';

/** A management page's runner: one action at a time, with the outcome announced. */
export type Act = (work: () => Promise<unknown>, done?: string) => Promise<void>;

/** Shared by the collection console and the My space manager, so both report outcomes the same way. */
export function createActions() {
  let disposed = false;
  let line: HTMLElement | undefined;
  onCleanup(() => { disposed = true; });
  const [busy, setBusy] = createSignal(false),
    [message, setMessage] = createSignal('');
  const act: Act = async (work, done = 'Action accepted. Check the updated status below.') => {
    if (busy()) return;
    setBusy(true);
    setMessage('');
    try {
      await work();
      if (!disposed) setMessage(done);
    } catch (e) {
      if (!disposed) setMessage(errorText(e));
    } finally {
      if (!disposed) setBusy(false);
      // Re-rendered lists drop focus to the page; land it on the outcome instead.
      queueMicrotask(() => {
        if (!disposed && document.activeElement === document.body) line?.focus();
      });
    }
  };
  return { busy, message, act, line: (element: HTMLElement) => { line = element; } };
}
