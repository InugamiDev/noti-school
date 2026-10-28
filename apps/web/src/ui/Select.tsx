// intent: Clay single-select on Kobalte Select (listbox popup, typeahead, form-compatible hidden select).
// status: done
// next: keep option values stable strings; labels are display-only.
// confidence: medium (popup placement checked by typecheck and build only, not in a browser)
import { Select as KSelect } from '@kobalte/core/select';
import { Check, ChevronsUpDown } from 'lucide-solid';
import { Show, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './Select.module.scss';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Visible label. */
  label: string;
  /** Available options in display order. */
  options: SelectOption[];
  /** Selected option value, or null for none. */
  value: string | null;
  /** Called with the chosen option value. */
  onChange: (value: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  /** Supporting text under the field. */
  hint?: JSX.Element;
  /** Error text; marks the select invalid and announces the message. */
  error?: string | undefined;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  class?: string | undefined;
}

/** Labelled single select (Kobalte Select) with hint and error states. */
export function Select(props: SelectProps) {
  const selected = () => props.options.find(option => option.value === props.value) ?? null;
  return (
    <KSelect<SelectOption>
      class={cx(styles.field, props.class)}
      options={props.options}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      value={selected()}
      onChange={option => {
        if (option) props.onChange(option.value);
      }}
      placeholder={props.placeholder ?? 'Choose an option'}
      validationState={props.error ? 'invalid' : 'valid'}
      required={props.required ?? false}
      disabled={props.disabled ?? false}
      name={props.name ?? ''}
      gutter={6}
      itemComponent={itemProps => (
        <KSelect.Item item={itemProps.item} class={styles.item}>
          <KSelect.ItemLabel>{itemProps.item.rawValue.label}</KSelect.ItemLabel>
          <KSelect.ItemIndicator class={styles.indicator}>
            <Check size={16} aria-hidden="true" />
          </KSelect.ItemIndicator>
        </KSelect.Item>
      )}
    >
      <KSelect.Label class={styles.label}>{props.label}</KSelect.Label>
      <KSelect.HiddenSelect />
      <KSelect.Trigger class={styles.trigger}>
        <KSelect.Value<SelectOption> class={styles.value}>{state => state.selectedOption()?.label}</KSelect.Value>
        <KSelect.Icon class={styles.chevron}>
          <ChevronsUpDown size={16} aria-hidden="true" />
        </KSelect.Icon>
      </KSelect.Trigger>
      <Show when={props.hint}>
        <KSelect.Description class={styles.hint}>{props.hint}</KSelect.Description>
      </Show>
      <KSelect.ErrorMessage class={styles.error}>{props.error}</KSelect.ErrorMessage>
      <KSelect.Portal>
        <KSelect.Content class={styles.content}>
          <KSelect.Listbox class={styles.listbox} />
        </KSelect.Content>
      </KSelect.Portal>
    </KSelect>
  );
}
