import { Show, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './Badge.module.scss';

export type BadgeTone = 'neutral' | 'sage' | 'clay' | 'danger';

export interface BadgeProps {
  /** neutral (default) for superseded, meta, sample and demo labels; sage approved; clay under review only; danger unavailable. */
  tone?: BadgeTone;
  /** Shows a leading status dot in the current colour. */
  dot?: boolean;
  class?: string | undefined;
  children: JSX.Element;
}

/** Small pill status label. */
export function Badge(props: BadgeProps) {
  return (
    <span class={cx(styles.badge, styles[props.tone ?? 'neutral'], props.class)}>
      <Show when={props.dot}>
        <span class={styles.dot} aria-hidden="true" />
      </Show>
      {props.children}
    </span>
  );
}
