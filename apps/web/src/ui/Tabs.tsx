import { Tabs as KTabs } from '@kobalte/core/tabs';
import { For, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './Tabs.module.scss';

export interface TabItem {
  value: string;
  label: string;
  /** Panel content. */
  content: JSX.Element;
}

export interface TabsProps {
  /** Accessible name of the tab list, e.g. "Answer state". */
  'aria-label': string;
  items: readonly TabItem[];
  /** Selected tab (controlled); omit and use defaultValue for uncontrolled tabs. */
  value?: string;
  /** Initially selected tab when uncontrolled; defaults to the first item. */
  defaultValue?: string;
  /** Called with the newly selected tab value. */
  onChange?: (value: string) => void;
  class?: string | undefined;
}

/** Pill tab list with panels (Kobalte Tabs); arrow keys move between tabs. */
export function Tabs(props: TabsProps) {
  return (
    <KTabs
      class={cx(styles.tabs, props.class)}
      {...(props.value === undefined ? {} : { value: props.value })}
      defaultValue={props.defaultValue ?? props.items[0]?.value ?? ''}
      onChange={value => props.onChange?.(value)}
    >
      <KTabs.List class={styles.list} aria-label={props['aria-label']}>
        <For each={props.items}>{item => <KTabs.Trigger class={styles.trigger} value={item.value}>{item.label}</KTabs.Trigger>}</For>
      </KTabs.List>
      <For each={props.items}>{item => <KTabs.Content class={styles.panel} value={item.value}>{item.content}</KTabs.Content>}</For>
    </KTabs>
  );
}
