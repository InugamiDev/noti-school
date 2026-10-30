import { Accordion as KAccordion } from '@kobalte/core/accordion';
import Plus from 'lucide-solid/icons/plus';
import { For, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './Accordion.module.scss';

export interface AccordionItem {
  value: string;
  /** Question or heading text. */
  title: JSX.Element;
  content: JSX.Element;
}

export interface AccordionProps {
  /** Items to show; filter this list (e.g. with matchesQuery) for a live FAQ filter. */
  items: readonly AccordionItem[];
  /** Expanded item values (controlled); omit for uncontrolled. */
  value?: string[];
  /** Called with the expanded item values. */
  onChange?: (value: string[]) => void;
  /** Allow several items open at once; defaults to true. */
  multiple?: boolean;
  class?: string | undefined;
}

/** Expandable list (Kobalte Accordion) with a + icon that rotates to x when open. */
export function Accordion(props: AccordionProps) {
  return (
    <KAccordion
      class={cx(styles.accordion, props.class)}
      multiple={props.multiple ?? true}
      collapsible
      {...(props.value === undefined ? {} : { value: props.value })}
      onChange={value => props.onChange?.(value)}
    >
      <For each={props.items}>
        {item => (
          <KAccordion.Item class={styles.item} value={item.value}>
            <KAccordion.Header class={styles.header}>
              <KAccordion.Trigger class={styles.trigger}>
                <span>{item.title}</span>
                <Plus class={cx(styles.icon)} size={18} aria-hidden="true" />
              </KAccordion.Trigger>
            </KAccordion.Header>
            <KAccordion.Content class={styles.content}>
              <div class={styles.body}>{item.content}</div>
            </KAccordion.Content>
          </KAccordion.Item>
        )}
      </For>
    </KAccordion>
  );
}
