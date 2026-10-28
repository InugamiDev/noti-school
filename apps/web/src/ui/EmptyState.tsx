import type { LucideIcon } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { cx } from './lib/cx';
import styles from './EmptyState.module.scss';

export interface EmptyStateProps {
  /** lucide-solid icon shown in the clay tile. */
  icon: LucideIcon;
  /** Short heading, e.g. "No questions yet". */
  title: string;
  /** One supporting sentence. */
  body?: JSX.Element;
  /** Action slot, usually one or two Buttons. */
  action?: JSX.Element;
  class?: string | undefined;
}

/** Dashed empty/no-result panel with icon, title, body and an action slot. */
export function EmptyState(props: EmptyStateProps) {
  return (
    <div class={cx(styles.empty, props.class)}>
      <div class={styles.icon} aria-hidden="true">
        <Dynamic component={props.icon} size={22} />
      </div>
      <h3 class={styles.title}>{props.title}</h3>
      <Show when={props.body}>
        <p class={styles.body}>{props.body}</p>
      </Show>
      <Show when={props.action}>
        <div class={styles.actions}>{props.action}</div>
      </Show>
    </div>
  );
}
