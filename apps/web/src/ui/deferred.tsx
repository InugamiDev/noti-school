// intent: overlays whose code (Kobalte Dialog with its focus trap and scroll lock) is not needed for first paint. Each
//         loads when the browser is idle or on first open, whichever comes first, and mounts once it has been opened.
// status: done
// next: only for components with a controlled `open` prop that render nothing while closed.
// confidence: high
import { createComputed, createSignal, lazy, onCleanup, onMount, Show, type Component } from 'solid-js';
import { whenIdle } from './lib/idle';
import type { CommandMenuProps } from './CommandMenu';
import type { SheetProps } from './Sheet';

function deferred<P extends { open: boolean }>(load: () => Promise<Component<P>>) {
  const Loaded = lazy(() => load().then(component => ({ default: component })));
  return (props: P) => {
    const [used, setUsed] = createSignal(false);
    onMount(() => onCleanup(whenIdle(() => void Loaded.preload())));
    createComputed(() => {
      if (props.open) setUsed(true);
    });
    return (
      <Show when={used()}>
        <Loaded {...props} />
      </Show>
    );
  };
}

export const CommandMenu = deferred<CommandMenuProps>(() => import('./CommandMenu').then(module => module.CommandMenu));
export const Sheet = deferred<SheetProps>(() => import('./Sheet').then(module => module.Sheet));
