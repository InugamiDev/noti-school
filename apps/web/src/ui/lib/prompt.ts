// intent: the prompt-input keyboard and submit contract as pure functions (Enter asks, Shift+Enter new line, IME never submits).
// status: done
// next: PromptInput.tsx is the only intended caller; keep the DOM wiring there.
// confidence: high

export type AnswerLanguage = 'en' | 'vi';

/** Send is allowed only with non-whitespace text, within the limit, and no request already pending. */
export function canSubmitPrompt(value: string, pending: boolean, maxLength?: number): boolean {
  if (pending || !value.trim()) return false;
  return maxLength === undefined || [...value].length <= maxLength;
}

export type PromptKeyAction = 'submit' | 'blur' | 'none';

export interface PromptKeyInput {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  /** Legacy keyCode; Safari reports 229 for the Enter that commits an IME candidate. */
  keyCode?: number;
}

/**
 * Decides what a textarea keydown means. 'submit' requires a submittable value; Enter that cannot submit
 * returns 'none' so the caller still suppresses the newline only when it actually submits.
 */
export function promptKeyAction(event: PromptKeyInput, value: string, pending: boolean, maxLength?: number): PromptKeyAction {
  if (event.isComposing || event.keyCode === 229) return 'none';
  if (event.key === 'Escape') return 'blur';
  if (event.key !== 'Enter' || event.shiftKey) return 'none';
  return canSubmitPrompt(value, pending, maxLength) ? 'submit' : 'none';
}

/** True when the key is a plain Enter that should never insert a newline (it asks or does nothing). */
export function isPlainEnter(event: PromptKeyInput): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229;
}

/** Heuristic for sample questions: text containing Vietnamese-only letters implies a Vietnamese answer. */
export function looksVietnamese(text: string): boolean {
  return /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text);
}
