// intent: Clay pill button; one component for actions (<button> via Kobalte) and navigation (<a> when href is set).
// status: done
// next: icon-only buttons should usually sit inside Tooltip, which never replaces the aria-label.
// confidence: high
import { Button as KButton } from '@kobalte/core/button';
import { Show, splitProps, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import { Spinner } from './Spinner';
import styles from './Button.module.scss';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

type ButtonBaseProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'children'> & {
  /** primary is the single clay-filled control per view; defaults to secondary. */
  variant?: ButtonVariant;
  /** md is 44px tall, sm is 36px. */
  size?: ButtonSize;
  /** Shows a spinner in place of the label and disables the button. */
  loading?: boolean;
  /** Visible text next to the spinner while loading, e.g. "Saving"; otherwise the label stays for screen readers only. */
  loadingLabel?: string;
  /** Renders an <a> with this href instead of a <button>. */
  href?: string;
  /** Anchor target, only used with href. */
  target?: string;
  /** Anchor rel, only used with href. */
  rel?: string;
  class?: string | undefined;
  children?: JSX.Element;
};

/** Icon-only buttons are square and must carry an aria-label. */
export type ButtonProps = ButtonBaseProps & ({ iconOnly?: false } | { iconOnly: true; 'aria-label': string });

/** Clay button: variants primary|secondary|ghost, sizes md|sm, icon-only, loading, or a link when href is given. */
export function Button(props: ButtonProps) {
  const [local, rest] = splitProps(props, [
    'variant',
    'size',
    'iconOnly',
    'loading',
    'loadingLabel',
    'href',
    'target',
    'rel',
    'class',
    'children',
    'disabled',
    'type',
  ]);
  const className = () =>
    cx(
      styles.btn,
      styles[local.variant ?? 'secondary'],
      local.size === 'sm' && styles.sm,
      local.iconOnly && styles.icon,
      local.class,
    );
  const content = () => (
    <Show when={local.loading} fallback={local.children}>
      <Spinner />
      <Show when={local.loadingLabel} fallback={<span class="sr-only">{local.children}</span>}>
        {label => <span>{label()}</span>}
      </Show>
    </Show>
  );

  return (
    <Show
      when={local.href}
      fallback={
        <KButton
          {...rest}
          type={local.type ?? 'button'}
          class={className()}
          disabled={local.disabled || local.loading}
          aria-busy={local.loading || undefined}
        >
          {content()}
        </KButton>
      }
    >
      {href => {
        const inactive = () => Boolean(local.disabled || local.loading);
        return (
          <a
            class={className()}
            href={inactive() ? undefined : href()}
            target={local.target}
            rel={local.rel}
            aria-label={rest['aria-label']}
            aria-current={rest['aria-current']}
            aria-disabled={inactive() || undefined}
            aria-busy={local.loading || undefined}
          >
            {content()}
          </a>
        );
      }}
    </Show>
  );
}
