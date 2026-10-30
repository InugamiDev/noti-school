// intent: the question composer, shadcn AI Elements Prompt Input anatomy: one bordered group, auto-growing textarea, bottom bar.
//         When the draft reads as Vietnamese but English is selected, the bar offers the switch; it never switches silently.
// status: done
// next: callers own persistence (draft/language via lib/storage) and the actual ask request; this only emits onSubmit.
// confidence: high for the keyboard contract (unit tested in lib/prompt.ts); medium for the JS auto-grow fallback (browser-only)
import { TextField as KTextField } from '@kobalte/core/text-field';
import { ArrowUp } from 'lucide-solid';
import { createEffect, on, Show, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import { canSubmitPrompt, isPlainEnter, looksVietnamese, promptKeyAction, type AnswerLanguage } from './lib/prompt';
import { Kbd } from './Kbd';
import { SegmentedToggle, type SegmentedOption } from './SegmentedToggle';
import { Spinner } from './Spinner';
import styles from './PromptInput.module.scss';

const LANGUAGES: readonly SegmentedOption<AnswerLanguage>[] = [
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'vi', label: 'Tiếng Việt', short: 'VI' },
];

/** The counter appears once the draft reaches this share of maxLength. */
const COUNT_THRESHOLD = 0.8;

export interface PromptInputProps {
  /** Draft text (controlled). */
  value: string;
  /** Called with the new draft on every edit. */
  onInput: (value: string) => void;
  /** Called with the trimmed question when Enter or the send button asks. */
  onSubmit: (question: string) => void;
  placeholder?: string;
  /** Maximum length in Unicode code points; send disables above it and a counter appears near it. */
  maxLength?: number;
  /** A request is in flight: send shows a spinner and is disabled. */
  pending?: boolean;
  /** Selected answer language. */
  language: AnswerLanguage;
  /** Called when the language toggle changes. */
  onLanguage: (language: AnswerLanguage) => void;
  /** Render prop for the school scope control in the bar, usually a SchoolPicker. */
  school?: () => JSX.Element;
  /** Hint in the bar; defaults to "Enter to ask". Hidden on narrow screens. */
  hint?: JSX.Element;
  /** Accessible label; defaults to "Your question". */
  label?: string;
  /** Shows the label above the box instead of keeping it screen-reader only. */
  showLabel?: boolean;
  /** Receives the textarea, e.g. for the "/" focus shortcut. */
  textareaRef?: (element: HTMLTextAreaElement) => void;
  class?: string | undefined;
}

const supportsFieldSizing = (): boolean => typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

/** Question composer: Enter asks, Shift+Enter adds a line, IME composition never submits, Escape blurs. */
export function PromptInput(props: PromptInputProps) {
  let textarea: HTMLTextAreaElement | undefined;
  const nativeSizing = supportsFieldSizing();
  const pending = () => props.pending ?? false;
  const length = () => [...props.value].length;
  const canSend = () => canSubmitPrompt(props.value, pending(), props.maxLength);
  const showCount = () => props.maxLength !== undefined && length() >= props.maxLength * COUNT_THRESHOLD;
  const overLimit = () => props.maxLength !== undefined && length() > props.maxLength;

  // Fallback for browsers without field-sizing: grow to content; CSS max-height caps it and scrolls.
  const resize = () => {
    if (nativeSizing || !textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  createEffect(on(() => props.value, resize));

  const submit = () => {
    if (canSend()) props.onSubmit(props.value.trim());
  };

  const onKeyDown: JSX.EventHandler<HTMLTextAreaElement, KeyboardEvent> = event => {
    const action = promptKeyAction(event, props.value, pending(), props.maxLength);
    if (action === 'blur') {
      event.currentTarget.blur();
      return;
    }
    if (isPlainEnter(event)) event.preventDefault();
    if (action === 'submit') submit();
  };

  return (
    <form
      class={cx(styles.form, props.class)}
      novalidate
      onSubmit={event => {
        event.preventDefault();
        submit();
      }}
    >
      <KTextField
        value={props.value}
        onChange={props.onInput}
        validationState={overLimit() ? 'invalid' : 'valid'}
        class={styles.field}
      >
        <KTextField.Label class={props.showLabel ? styles.label : 'sr-only'}>{props.label ?? 'Your question'}</KTextField.Label>
        <div class={styles.prompt}>
          <KTextField.TextArea
            ref={element => {
              textarea = element;
              props.textareaRef?.(element);
            }}
            class={styles.textarea}
            rows={2}
            placeholder={props.placeholder}
            lang={props.language}
            onKeyDown={onKeyDown}
          />
          <div class={styles.bar}>
            <Show when={props.school}>{school => school()()}</Show>
            <SegmentedToggle aria-label="Answer language" options={LANGUAGES} value={props.language} onChange={props.onLanguage} />
            <Show when={props.language === 'en' && looksVietnamese(props.value)}>
              <button type="button" class={styles.suggest} onClick={() => props.onLanguage('vi')}>
                Answer in <span lang="vi">Tiếng Việt</span>?
              </button>
            </Show>
            <span class={styles.end}>
              <span class={styles.hint}>
                <Show when={props.hint} fallback={<><Kbd>Enter</Kbd> to ask</>}>
                  {props.hint}
                </Show>
              </span>
              <Show when={showCount()}>
                <KTextField.Description class={cx(styles.count, overLimit() && styles.over)}>
                  {length()}/{props.maxLength}
                </KTextField.Description>
              </Show>
              <button class={styles.send} type="submit" aria-label="Ask" disabled={!canSend()} aria-busy={pending() || undefined}>
                <Show when={pending()} fallback={<ArrowUp size={18} aria-hidden="true" />}>
                  <Spinner />
                </Show>
              </button>
            </span>
          </div>
        </div>
      </KTextField>
    </form>
  );
}
