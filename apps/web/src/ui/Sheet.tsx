// intent: right-hand drawer (mobile menu) on Kobalte Dialog: modal, focus trapped inside, focus returned to the opener on close.
// status: done
// next: put navigation links and at most one primary Button in children.
// confidence: high
import { Dialog } from '@kobalte/core/dialog';
import X from 'lucide-solid/icons/x';
import { createComputed, on, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './Sheet.module.scss';

export interface SheetProps {
  /** Open state (controlled). */
  open: boolean;
  /** Called on close requests (Escape, overlay click, close button) and with true when opened. */
  onOpenChange: (open: boolean) => void;
  /** Dialog title; visible at the top of the panel. */
  title: string;
  /** Accessible name of the close button; defaults to "Close menu". */
  closeLabel?: string;
  children: JSX.Element;
  class?: string | undefined;
}

/** Right drawer dialog; focus moves into the panel and returns to whatever opened it. */
export function Sheet(props: SheetProps) {
  // Kobalte only restores focus to its own Trigger; remember the opener so external buttons get focus back too.
  let opener: HTMLElement | null = null;
  createComputed(
    on(
      () => props.open,
      open => {
        if (open && typeof document !== 'undefined') opener = document.activeElement as HTMLElement | null;
      },
    ),
  );
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class={styles.overlay} />
        <Dialog.Content
          class={cx(styles.panel, props.class)}
          onCloseAutoFocus={event => {
            event.preventDefault();
            opener?.focus();
          }}
        >
          <div class={styles.head}>
            <Dialog.Title class={styles.title}>{props.title}</Dialog.Title>
            <Dialog.CloseButton class={styles.close} aria-label={props.closeLabel ?? 'Close menu'}>
              <X size={20} aria-hidden="true" />
            </Dialog.CloseButton>
          </div>
          {props.children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
