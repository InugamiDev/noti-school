// intent: Cmd/Ctrl+K command palette on Kobalte Dialog with a combobox-style filtered, grouped listbox. Text that matches
//         no command becomes one selectable "Ask" row.
// status: done
// next: pass app-level commands from the shell; onFallback should put the text into the question box.
// confidence: high for filtering/Enter resolution (lib/command.ts tested); medium for focus hand-off (browser-only)
import { Dialog } from '@kobalte/core/dialog';
import { MessageSquare, Search } from 'lucide-solid';
import { createComputed, createEffect, createMemo, createSignal, createUniqueId, For, on, onCleanup, onMount, Show, type Accessor, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Kbd } from './Kbd';
import { commandsWithAsk, groupCommands, moveActive, resolveCommandEnter, type CommandItem } from './lib/command';
import { isCommandShortcut } from './lib/platform';
import styles from './CommandMenu.module.scss';

export interface CommandMenuProps {
  /** Open state (controlled), usually from useCommandMenu(). */
  open: boolean;
  /** Called with false on Escape, overlay click or after running an item. */
  onOpenChange: (open: boolean) => void;
  /** All commands; the menu filters them by label and keywords, ignoring Vietnamese diacritics. */
  items: readonly CommandItem[];
  /** Called with the typed text when Enter is pressed and nothing matches (ask it as a question). */
  onFallback: (text: string) => void;
  /** Search placeholder. */
  placeholder?: string;
}

/** Command palette: type to filter, arrows move, Enter runs (or falls back to asking), Escape closes. */
export function CommandMenu(props: CommandMenuProps) {
  const listId = createUniqueId();
  const [query, setQuery] = createSignal('');
  const [active, setActive] = createSignal(0);
  const shown = createMemo(() => commandsWithAsk(props.items, query(), text => props.onFallback(text), MessageSquare));
  const groups = createMemo(() => groupCommands(shown()));
  const optionId = (item: CommandItem) => `${listId}-${item.id}`;
  const activeItem = () => shown()[active()];

  // The chosen action runs after the dialog has released focus, so it can move focus (e.g. into the question box).
  let opener: HTMLElement | null = null;
  let pendingAction: (() => void) | undefined;
  createComputed(
    on(
      () => props.open,
      open => {
        if (!open) return;
        opener = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
        pendingAction = undefined;
        setQuery('');
        setActive(0);
      },
    ),
  );
  createEffect(() => {
    const item = activeItem();
    if (props.open && item) document.getElementById(optionId(item))?.scrollIntoView({ block: 'nearest' });
  });

  const finish = (action: () => void) => {
    pendingAction = action;
    props.onOpenChange(false);
  };
  const enter = (index: number) => {
    const result = resolveCommandEnter(shown(), index, query());
    if (result.kind === 'run') finish(result.item.run);
    else if (result.kind === 'fallback') finish(() => props.onFallback(result.text));
  };
  const onKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = event => {
    if (event.isComposing) return;
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move) {
      event.preventDefault();
      setActive(index => moveActive(index, move, shown().length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      enter(active());
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class={styles.overlay} />
        <div class={styles.positioner}>
          <Dialog.Content
            class={styles.dialog}
            onCloseAutoFocus={event => {
              event.preventDefault();
              const action = pendingAction;
              pendingAction = undefined;
              if (action) action();
              if (!action || !document.activeElement || document.activeElement === document.body) opener?.focus();
            }}
          >
            <Dialog.Title class="sr-only">Command menu</Dialog.Title>
            <div class={styles.search}>
              <Search size={18} aria-hidden="true" />
              <input
                class={styles.input}
                type="text"
                role="combobox"
                aria-label="Search commands"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={activeItem() ? optionId(activeItem() as CommandItem) : undefined}
                autocomplete="off"
                placeholder={props.placeholder ?? 'Search or ask'}
                value={query()}
                onInput={event => {
                  setQuery(event.currentTarget.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
              />
              <Kbd>Esc</Kbd>
            </div>
            <ul id={listId} class={styles.list} role="listbox" aria-label="Commands">
              <Show
                when={shown().length}
                fallback={
                  <li class={styles.empty} role="presentation">
                    No commands available.
                  </li>
                }
              >
                <For each={groups()}>
                  {group => {
                    const headingId = createUniqueId();
                    return (
                      <li role="presentation">
                        <div id={headingId} class={styles.group} aria-hidden="true">
                          {group.group}
                        </div>
                        <ul role="group" aria-labelledby={headingId} class={styles.groupList}>
                          <For each={group.items}>
                            {item => {
                              const index = () => shown().indexOf(item);
                              return (
                                <li
                                  id={optionId(item)}
                                  role="option"
                                  class={styles.item}
                                  aria-selected={index() === active()}
                                  onPointerMove={() => setActive(index())}
                                  onClick={() => enter(index())}
                                >
                                  <Show when={item.icon}>{icon => <Dynamic component={icon()} size={18} aria-hidden="true" />}</Show>
                                  <span>{item.label}</span>
                                  <Show when={item.shortcut}>{shortcut => <Kbd class={styles.shortcut}>{shortcut()}</Kbd>}</Show>
                                </li>
                              );
                            }}
                          </For>
                        </ul>
                      </li>
                    );
                  }}
                </For>
              </Show>
            </ul>
            <div class={styles.foot} aria-hidden="true">
              <span>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>move
              </span>
              <span>
                <Kbd>Enter</Kbd>select
              </span>
              <span>
                <Kbd>Esc</Kbd>close
              </span>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}

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
