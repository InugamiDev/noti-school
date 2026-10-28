import { ToggleGroup } from '@kobalte/core/toggle-group';
import { For, Show } from 'solid-js';
import { cx } from './lib/cx';
import styles from './SegmentedToggle.module.scss';

export interface SegmentedOption<T extends string = string> {
  value: T;
  /** Full label, shown from 520px up and always used as the accessible name. */
  label: string;
  /** Optional short label for narrow widths, e.g. "EN". */
  short?: string;
}

export interface SegmentedToggleProps<T extends string = string> {
  /** Accessible group name, e.g. "Answer language". */
  'aria-label': string;
  options: readonly SegmentedOption<T>[];
  /** Selected value; exactly one option is always selected. */
  value: T;
  /** Called with the newly selected value; deselecting the active item is ignored. */
  onChange: (value: T) => void;
  class?: string | undefined;
}

/** Single-selection pill toggle (Kobalte ToggleGroup) with optional short labels on narrow widths. */
export function SegmentedToggle<T extends string = string>(props: SegmentedToggleProps<T>) {
  const byValue = (value: string | null) => props.options.find(option => option.value === value);
  return (
    <ToggleGroup
      class={cx(styles.seg, props.class)}
      aria-label={props['aria-label']}
      value={props.value}
      onChange={value => {
        const option = byValue(value);
        if (option) props.onChange(option.value);
      }}
    >
      <For each={props.options}>
        {option => (
          <ToggleGroup.Item class={styles.item} value={option.value} aria-label={option.short ? option.label : undefined}>
            <Show when={option.short} fallback={option.label}>
              {short => (
                <>
                  <span class={styles.long}>{option.label}</span>
                  <span class={styles.short} aria-hidden="true">
                    {short()}
                  </span>
                </>
              )}
            </Show>
          </ToggleGroup.Item>
        )}
      </For>
    </ToggleGroup>
  );
}
