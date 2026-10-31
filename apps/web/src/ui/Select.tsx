import {
  createEffect,
  createSignal,
  createUniqueId,
  For,
  on,
  onCleanup,
  Show,
  type JSX,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { Check, ChevronDown } from 'lucide-solid';
import { animate, ease, motionAllowed, stagger } from './motion';

export type SelectOption = { value: string; label: string; hint?: string };

// intent: a select-only combobox (WAI-ARIA APG) so the open list matches the clay UI instead of the OS picker.
export function Select(props: {
  label: string;
  /** Visually hide the label; it still names the control. */
  hideLabel?: boolean;
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Form field name; a hidden input carries the value into FormData. */
  name?: string;
  id?: string;
  disabled?: boolean;
  class?: string;
  icon?: JSX.Element;
  placeholder?: string;
}) {
  const uid = createUniqueId();
  const labelId = `select-label-${uid}`;
  const listId = `select-list-${uid}`;
  const optionId = (index: number) => `select-${uid}-${index}`;
  const [own, setOwn] = createSignal(props.defaultValue ?? props.options[0]?.value ?? '');
  const value = () => (props.value !== undefined ? props.value : own());
  const selectedIndex = () => props.options.findIndex((o) => o.value === value());
  const [open, setOpen] = createSignal(false);
  const [mounted, setMounted] = createSignal(false);
  const [active, setActive] = createSignal(-1);
  const [place, setPlace] = createSignal<{ left: number; width: number; top?: number; bottom?: number; max: number }>({ left: 0, width: 0, max: 280 });
  let trigger!: HTMLButtonElement;
  let list: HTMLUListElement | undefined;
  let typed = '';
  let typedAt = 0;
  let closing: { stop: () => void } | undefined;

  const choose = (index: number) => {
    const option = props.options[index];
    if (!option) return;
    const previous = value();
    if (props.value === undefined) setOwn(option.value);
    if (option.value !== previous) props.onChange?.(option.value);
  };

  const position = () => {
    const rect = trigger.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const width = Math.max(rect.width, 180);
    const left = Math.min(Math.max(8, rect.left), innerWidth - width - 8);
    // Open upward only when the list would not fit below and there is more room above.
    if (below < 220 && above > below)
      setPlace({ left, width, bottom: innerHeight - rect.top + 6, max: Math.min(280, above) });
    else setPlace({ left, width, top: rect.bottom + 6, max: Math.min(280, Math.max(120, below)) });
  };

  const show = () => {
    if (props.disabled || open() || !props.options.length) return;
    closing?.stop();
    position();
    setActive(Math.max(0, selectedIndex()));
    setMounted(true);
    setOpen(true);
  };

  const hide = (refocus = true) => {
    if (!open()) return;
    setOpen(false);
    if (refocus) trigger.focus({ preventScroll: true });
    if (list && motionAllowed(trigger)) {
      const controls = animate(list, { opacity: 0, y: place().top !== undefined ? -4 : 4, scale: 0.98 }, { duration: 0.14, ease: ease.inOut });
      closing = controls;
      void controls.finished.then(() => {
        if (!open()) setMounted(false);
      });
    } else setMounted(false);
  };

  // Entrance: a soft spring for the panel, then a short stagger for the rows.
  createEffect(on(open, (isOpen) => {
    if (!isOpen || !list) return;
    list.querySelector<HTMLElement>(`#${CSS.escape(optionId(active()))}`)?.scrollIntoView({ block: 'nearest' });
    if (!motionAllowed(trigger)) return;
    const from = place().top !== undefined ? -8 : 8;
    animate(list, { opacity: [0, 1], y: [from, 0], scale: [0.96, 1] }, { type: 'spring', bounce: 0.22, duration: 0.38 });
    animate(list.querySelectorAll('li'), { opacity: [0, 1], x: [-4, 0] }, { duration: 0.22, ease: ease.out, delay: stagger(0.018, { startDelay: 0.03 }) });
  }));

  createEffect(() => {
    if (!open()) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.contains(target) && !list?.contains(target)) hide(false);
    };
    const reflow = (event: Event) => {
      if (list && event.target instanceof Node && list.contains(event.target)) return;
      position();
    };
    document.addEventListener('pointerdown', outside, true);
    addEventListener('scroll', reflow, true);
    addEventListener('resize', reflow);
    onCleanup(() => {
      document.removeEventListener('pointerdown', outside, true);
      removeEventListener('scroll', reflow, true);
      removeEventListener('resize', reflow);
    });
  });
  onCleanup(() => closing?.stop());

  const move = (index: number) => {
    const count = props.options.length;
    if (!count) return;
    const next = Math.min(count - 1, Math.max(0, index));
    setActive(next);
    list?.querySelector<HTMLElement>(`#${CSS.escape(optionId(next))}`)?.scrollIntoView({ block: 'nearest' });
  };

  const typeahead = (key: string) => {
    const now = Date.now();
    typed = now - typedAt > 600 ? key : typed + key;
    typedAt = now;
    const start = open() ? active() : selectedIndex();
    const options = props.options;
    for (let step = typed.length === 1 ? 1 : 0; step <= options.length; step++) {
      const index = (Math.max(0, start) + step) % options.length;
      if (options[index]?.label.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase())) {
        if (open()) move(index);
        else choose(index);
        return;
      }
    }
  };

  const keydown = (event: KeyboardEvent) => {
    const isOpen = open();
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (!isOpen) show();
        else if (event.altKey && event.key === 'ArrowUp') { choose(active()); hide(); }
        else move(active() + (event.key === 'ArrowDown' ? 1 : -1));
        return;
      case 'Home':
      case 'End':
        if (!isOpen) return;
        event.preventDefault();
        move(event.key === 'Home' ? 0 : props.options.length - 1);
        return;
      case 'PageDown':
      case 'PageUp':
        if (!isOpen) return;
        event.preventDefault();
        move(active() + (event.key === 'PageDown' ? 8 : -8));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (event.key === ' ' && isOpen && Date.now() - typedAt < 600) { typeahead(' '); return; }
        if (!isOpen) show();
        else { choose(active()); hide(); }
        return;
      case 'Escape':
        if (!isOpen) return;
        event.preventDefault();
        event.stopPropagation();
        hide();
        return;
      case 'Tab':
        if (isOpen) { choose(active()); hide(false); }
        return;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          typeahead(event.key);
        }
    }
  };

  const current = () => props.options[selectedIndex()];

  return (
    <div class={`select ${props.class ?? ''}`} classList={{ open: open() }}>
      <span id={labelId} class="select-label" classList={{ 'sr-only': !!props.hideLabel }}>
        {props.label}
      </span>
      <button
        ref={trigger}
        id={props.id}
        type="button"
        role="combobox"
        class="select-trigger"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-controls={listId}
        aria-activedescendant={open() && active() >= 0 ? optionId(active()) : undefined}
        disabled={props.disabled || !props.options.length}
        onClick={() => (open() ? hide() : show())}
        onKeyDown={keydown}
        onBlur={(event) => {
          if (open() && !(event.relatedTarget instanceof Node && list?.contains(event.relatedTarget))) hide(false);
        }}
      >
        {props.icon}
        <span class="select-value" classList={{ placeholder: !current() }}>
          {current()?.label ?? props.placeholder ?? ''}
        </span>
        <ChevronDown class="select-chevron" size={16} aria-hidden="true" />
      </button>
      <Show when={props.name}>
        <input type="hidden" name={props.name} value={value()} />
      </Show>
      <Show when={mounted()}>
        <Portal>
          <ul
            ref={list}
            id={listId}
            role="listbox"
            class="select-popup"
            aria-labelledby={labelId}
            tabIndex={-1}
            data-side={place().top !== undefined ? 'bottom' : 'top'}
            style={{
              left: `${place().left}px`,
              'min-width': `${place().width}px`,
              'max-height': `${place().max}px`,
              ...(place().top !== undefined ? { top: `${place().top}px` } : { bottom: `${place().bottom}px` }),
            }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <For each={props.options}>
              {(option, index) => (
                <li
                  id={optionId(index())}
                  role="option"
                  aria-selected={option.value === value()}
                  classList={{ active: active() === index() }}
                  onPointerMove={() => setActive(index())}
                  onClick={() => {
                    choose(index());
                    hide();
                  }}
                >
                  <span class="select-option-text">
                    {option.label}
                    <Show when={option.hint}>
                      <small>{option.hint}</small>
                    </Show>
                  </span>
                  <Check class="select-check" size={16} aria-hidden="true" />
                </li>
              )}
            </For>
          </ul>
        </Portal>
      </Show>
    </div>
  );
}
