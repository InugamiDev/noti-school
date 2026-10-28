import { splitProps, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './Chip.module.scss';

export type ChipProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'type'> & {
  class?: string | undefined;
  children: JSX.Element;
};

/** Pill suggestion button, e.g. a sample question; pass onClick to act on it. */
export function Chip(props: ChipProps) {
  const [local, rest] = splitProps(props, ['class', 'children']);
  return (
    <button {...rest} type="button" class={cx(styles.chip, local.class)}>
      {local.children}
    </button>
  );
}
