// intent: school scope control for the prompt bar: Kobalte Popover holding a searchable listbox (combobox pattern, aria-activedescendant).
// status: done
// next: callers decide what choosing 'request' means (request form, toast); this only reports the id.
// confidence: high for keyboard/filter logic (lib/school.ts tested); medium for popover placement (browser-only)
import { Popover } from '@kobalte/core/popover';
import { ChevronsUpDown, Plus, School as SchoolIcon } from 'lucide-solid';
import { createMemo, createSignal, createUniqueId, For, Show, type JSX } from 'solid-js';
import { Badge } from './Badge';
import { moveActive } from './lib/command';
import { cx } from './lib/cx';
import { filterSchools, REQUEST_SCHOOL_ID, schoolOptionIds, type School } from './lib/school';
import { SearchInput } from './SearchInput';
import styles from './SchoolPicker.module.scss';

export interface SchoolPickerProps {
  /** Schools the visitor can choose; the "My university isn't listed" option (id 'request') is always appended. */
  schools: readonly School[];
  /** Selected school id, or 'request'. */
  value: string;
  /** Called with the chosen school id, or 'request'. */
  onChange: (id: string) => void;
  /** Trigger text when 'request' or an unknown id is selected; defaults to "Your university". */
  fallbackLabel?: string;
  class?: string | undefined;
}

/** Searchable school picker: arrows move, Enter chooses, Escape and outside click close and return focus. */
export function SchoolPicker(props: SchoolPickerProps) {
  const listId = createUniqueId();
  const [open, setOpen] = createSignal(false);
  const [query, setQuery] = createSignal('');
  const [active, setActive] = createSignal(0);
  let search: HTMLInputElement | undefined;

  const shown = createMemo(() => filterSchools(props.schools, query()));
  const ids = createMemo(() => schoolOptionIds(props.schools, query()));
  const optionId = (id: string) => `${listId}-${id}`;
  const activeId = () => ids()[active()];
  const label = () => props.schools.find(school => school.id === props.value)?.name ?? props.fallbackLabel ?? 'Your university';

  const onOpenChange = (next: boolean) => {
    if (next) {
      setQuery('');
      setActive(Math.max(0, ids().indexOf(props.value)));
    }
    setOpen(next);
  };
  const choose = (id: string) => {
    props.onChange(id);
    setOpen(false);
  };
  const onKeyDown: JSX.EventHandler<HTMLInputElement, KeyboardEvent> = event => {
    if (event.isComposing) return;
    const move = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (move) {
      event.preventDefault();
      setActive(index => moveActive(index, move, ids().length));
      document.getElementById(optionId(activeId() ?? ''))?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const id = activeId();
      if (id) choose(id);
    }
  };

  const option = (id: string, index: () => number, body: JSX.Element) => (
    <li
      id={optionId(id)}
      role="option"
      class={styles.option}
      aria-selected={props.value === id}
      data-active={active() === index() ? '' : undefined}
      onPointerMove={() => setActive(index())}
      onClick={() => choose(id)}
    >
      {body}
    </li>
  );

  return (
    <Popover open={open()} onOpenChange={onOpenChange} placement="bottom-start" gutter={8}>
      {/* Opens below the bar (flipping only when the space runs out) so it never covers the headline being read. */}
      <Popover.Trigger class={cx(styles.trigger, props.class)} aria-label={`School: ${label()}. Change school`} title={label()}>
        <SchoolIcon class={cx(styles.school)} size={16} aria-hidden="true" />
        <span class={styles.name}>{label()}</span>
        <ChevronsUpDown class={cx(styles.chevron)} size={14} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          class={styles.pop}
          aria-label="Choose your university"
          onOpenAutoFocus={event => {
            event.preventDefault();
            search?.focus();
          }}
        >
          <SearchInput
            class={styles.search}
            label="Find your university"
            placeholder="Find your university"
            value={query()}
            onInput={value => {
              setQuery(value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            inputRef={element => (search = element)}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId() ? optionId(activeId() ?? '') : undefined}
            autocomplete="off"
          />
          <ul id={listId} role="listbox" aria-label="Universities" class={styles.list}>
            <For each={shown()}>
              {(school, index) =>
                option(
                  school.id,
                  index,
                  <>
                    <SchoolIcon size={18} aria-hidden="true" />
                    <span class={styles.text}>
                      {school.name}
                      <small>{school.subtitle}</small>
                    </span>
                    <Badge tone={school.status === 'pilot' ? 'sage' : 'neutral'} class={styles.badge}>
                      {school.status === 'pilot' ? 'Pilot' : 'Demo'}
                    </Badge>
                  </>,
                )
              }
            </For>
            <Show when={!shown().length}>
              <li role="presentation" class={styles.empty}>
                No matching university
              </li>
            </Show>
            <li role="presentation" class={styles.sep} />
            {option(
              REQUEST_SCHOOL_ID,
              () => shown().length,
              <>
                <Plus size={18} aria-hidden="true" />
                <span class={styles.text}>
                  My university isn't listed
                  <small>Ask for your school to be added</small>
                </span>
              </>,
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}
