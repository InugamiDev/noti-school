// intent: hover/focus hint on Kobalte Tooltip; the trigger is rendered by the caller so focus and pointer events land on the real control.
// status: done
// next: never use a tooltip as the only label; icon buttons keep their aria-label.
// confidence: medium (render-prop trigger relies on Kobalte's polymorphic `as` passing ref and handlers through)
import { Tooltip as KTooltip } from '@kobalte/core/tooltip';
import type { JSX } from 'solid-js';
import styles from './Tooltip.module.scss';

/** Props Kobalte needs on the trigger element (ref, aria-describedby, pointer and focus handlers); spread them onto it. */
export type TooltipTriggerProps = Omit<JSX.HTMLAttributes<HTMLElement>, 'ref'> & { ref?: (element: HTMLElement) => void };

export interface TooltipProps {
  /** Short supplementary text. */
  content: string;
  /** Render prop for the trigger: `{trigger => <Button {...trigger} ... />}`. */
  children: (trigger: TooltipTriggerProps) => JSX.Element;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

/** Tooltip shown after 300ms on hover or keyboard focus (Kobalte Tooltip). */
export function Tooltip(props: TooltipProps) {
  return (
    <KTooltip openDelay={300} closeDelay={0} placement={props.placement ?? 'top'} gutter={8}>
      <KTooltip.Trigger as={(trigger: TooltipTriggerProps) => props.children(trigger)} />
      <KTooltip.Portal>
        <KTooltip.Content class={styles.tip}>{props.content}</KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip>
  );
}
