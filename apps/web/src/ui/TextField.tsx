// intent: labelled single-line field with hint and inline error wired through Kobalte (aria-invalid + aria-describedby).
// status: done
// next: forms without a backend endpoint must say so near the submit button, not here.
// confidence: high
import { TextField as KTextField } from '@kobalte/core/text-field';
import { Show, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import styles from './TextField.module.scss';

export interface TextFieldProps {
  /** Visible label. */
  label: string;
  /** Current value (controlled). */
  value: string;
  /** Called with the new string on every edit. */
  onChange: (value: string) => void;
  /** Supporting text under the field, announced via aria-describedby. */
  hint?: JSX.Element;
  /** Error text; when set the field is aria-invalid and the message is announced. */
  error?: string | undefined;
  type?: 'text' | 'email' | 'url' | 'tel' | 'password';
  name?: string;
  placeholder?: string;
  autocomplete?: string;
  required?: boolean;
  disabled?: boolean;
  /** Receives the input element, e.g. to focus the first invalid field. */
  inputRef?: (element: HTMLInputElement) => void;
  class?: string | undefined;
}

/** Clay text input with label, hint and error (Kobalte TextField). */
export function TextField(props: TextFieldProps) {
  return (
    <KTextField
      class={cx(styles.field, props.class)}
      value={props.value}
      onChange={props.onChange}
      validationState={props.error ? 'invalid' : 'valid'}
      required={props.required ?? false}
      disabled={props.disabled ?? false}
      name={props.name ?? ''}
    >
      <KTextField.Label class={styles.label}>{props.label}</KTextField.Label>
      <KTextField.Input
        ref={props.inputRef}
        class={styles.input}
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        autocomplete={props.autocomplete}
      />
      <Show when={props.hint}>
        <KTextField.Description class={styles.hint}>{props.hint}</KTextField.Description>
      </Show>
      <KTextField.ErrorMessage class={styles.error}>{props.error}</KTextField.ErrorMessage>
    </KTextField>
  );
}
