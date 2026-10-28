import { Show, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import { currentPlatform, modifierLabel } from './lib/platform';
import styles from './Kbd.module.scss';

export interface KbdProps {
  /** Prefixes the platform modifier: "Cmd" on macOS and iOS, "Ctrl" elsewhere. */
  mod?: boolean;
  class?: string | undefined;
  /** Key label, e.g. "K", "Enter", "/". */
  children?: JSX.Element;
}

/** Keyboard hint in mono; `<Kbd mod>K</Kbd>` reads "Cmd K" on Apple platforms and "Ctrl K" elsewhere. */
export function Kbd(props: KbdProps) {
  const modifier = modifierLabel(currentPlatform());
  return (
    <kbd class={cx(styles.kbd, props.class)}>
      <Show when={props.mod} fallback={props.children}>
        {modifier}
        <Show when={props.children}> {props.children}</Show>
      </Show>
    </kbd>
  );
}
