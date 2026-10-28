import { cx } from './lib/cx';
import styles from './Spinner.module.scss';

export interface SpinnerProps {
  /** sm is 14px (inline progress), md is 16px (buttons). */
  size?: 'sm' | 'md';
  /** Extra class, e.g. to recolour via `color`. */
  class?: string | undefined;
}

/** Decorative rotating ring; always aria-hidden, so pair it with visible or sr-only text. */
export function Spinner(props: SpinnerProps) {
  return <span class={cx(styles.spinner, props.size === 'sm' && styles.sm, props.class)} aria-hidden="true" />;
}
