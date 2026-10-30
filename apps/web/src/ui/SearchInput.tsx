import Search from 'lucide-solid/icons/search';
import { splitProps, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './SearchInput.module.scss';

export type SearchInputProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type' | 'class' | 'value' | 'onInput' | 'ref'> & {
  /** Accessible name; the search field has no visible label. */
  label: string;
  /** Current query (controlled). */
  value: string;
  /** Called with the new query on every edit. */
  onInput: (value: string) => void;
  /** Receives the input element. */
  inputRef?: (element: HTMLInputElement) => void;
  class?: string | undefined;
};

/** Search field with a leading search icon. */
export function SearchInput(props: SearchInputProps) {
  const [local, rest] = splitProps(props, ['label', 'value', 'onInput', 'inputRef', 'class']);
  return (
    <div class={cx(styles.wrap, local.class)}>
      <Search class={cx(styles.icon)} size={18} aria-hidden="true" />
      <input
        {...rest}
        ref={local.inputRef}
        class={styles.input}
        type="search"
        aria-label={local.label}
        value={local.value}
        onInput={event => local.onInput(event.currentTarget.value)}
      />
    </div>
  );
}
