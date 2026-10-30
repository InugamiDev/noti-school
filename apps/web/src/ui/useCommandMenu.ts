import { createSignal, onCleanup, onMount, type Accessor } from 'solid-js';
import { isCommandShortcut } from './lib/platform';

export interface CommandMenuState {
  open: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

/** Open state for CommandMenu plus a global Cmd/Ctrl+K listener that toggles it; the listener is removed on cleanup. */
export function useCommandMenu(): CommandMenuState {
  const [open, setOpen] = createSignal(false);
  const toggle = () => setOpen(value => !value);
  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isCommandShortcut(event)) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });
  return { open, setOpen: value => setOpen(value), toggle };
}
