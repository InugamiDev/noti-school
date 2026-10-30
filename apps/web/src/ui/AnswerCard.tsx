// intent: the four designed answer states in one card: answer | loading | no-answer | unavailable.
// status: done
// next: callers map API outcomes to states; abstained answers use no-answer, provider outages use unavailable.
// confidence: high
// Truthfulness rules enforced here: no "verified" label in any state; unavailable is role=alert and never shows answer text.
import CircleStop from 'lucide-solid/icons/circle-stop';
import CloudOff from 'lucide-solid/icons/cloud-off';
import FileQuestion from 'lucide-solid/icons/file-question-mark';
import { Match, Show, Switch, type JSX } from 'solid-js';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { cx } from './lib/cx';
import { Skeleton } from './Skeleton';
import { Spinner } from './Spinner';
import styles from './AnswerCard.module.scss';

interface AnswerCardCommon {
  /** Accessible name for the card region. */
  'aria-label'?: string;
  class?: string | undefined;
}

export interface AnswerStateProps extends AnswerCardCommon {
  state: 'answer';
  /** Leading label, e.g. <Badge>Sample handbook, not HCMIU policy</Badge>. Never a "verified" label. */
  badge?: JSX.Element;
  /** Trailing header actions, e.g. a copy-answer icon button. */
  actions?: JSX.Element;
  /** Answer text with CitationChips, followed by SourceExcerpts. */
  children: JSX.Element;
  /** Footer slot, e.g. feedback buttons. */
  footer?: JSX.Element;
}

export interface LoadingStateProps extends AnswerCardCommon {
  state: 'loading';
  /** Real progress text, e.g. "Reading 3 matching passages". */
  progress: string;
  /** Cancels the request; the Stop button is hidden without it. */
  onStop?: () => void;
}

export interface NoAnswerStateProps extends AnswerCardCommon {
  state: 'no-answer';
  /** Defaults to "No supported answer". */
  title?: string;
  /** Defaults to an explanation that the approved sources do not cover the question. */
  body?: JSX.Element;
  /** Next-step actions, e.g. Search sources and Rephrase buttons. */
  nextSteps?: JSX.Element;
}

export interface UnavailableStateProps extends AnswerCardCommon {
  state: 'unavailable';
  /** Defaults to "Answers are unavailable right now." */
  title?: string;
  /** Why, and what happens to the question, in plain words. */
  body?: JSX.Element;
  /** Optional retry or alternative action. */
  action?: JSX.Element;
}

export type AnswerCardProps = AnswerStateProps | LoadingStateProps | NoAnswerStateProps | UnavailableStateProps;

/** Answer card rendering exactly one state; loading shows progress and Stop, unavailable is an alert with no guessed answer. */
export function AnswerCard(props: AnswerCardProps) {
  return (
    <Switch>
      <Match when={props.state === 'answer' && props}>
        {answer => (
          <article class={cx(styles.card, answer().class)} aria-label={answer()['aria-label'] ?? 'Answer'}>
            <Show when={answer().badge || answer().actions}>
              <div class={styles.head}>
                <span class={styles.badge}>{answer().badge}</span>
                {answer().actions}
              </div>
            </Show>
            <div class={styles.text}>{answer().children}</div>
            <Show when={answer().footer}>
              <div class={styles.footer}>{answer().footer}</div>
            </Show>
          </article>
        )}
      </Match>
      <Match when={props.state === 'loading' && props}>
        {loading => (
          <article class={cx(styles.card, loading().class)} aria-label={loading()['aria-label'] ?? 'Answer loading'} aria-busy="true">
            <div class={styles.progress} role="status">
              <Spinner size="sm" class={styles.spinner} />
              {loading().progress}
            </div>
            <Skeleton width="92%" />
            <Skeleton width="78%" class={styles.gap} />
            <Skeleton height="72px" radius="sm" class={styles.block} />
            <Show when={loading().onStop}>
              {stop => (
                <Button variant="ghost" size="sm" class={styles.stop} onClick={() => stop()()}>
                  <CircleStop aria-hidden="true" />
                  Stop
                </Button>
              )}
            </Show>
          </article>
        )}
      </Match>
      <Match when={props.state === 'no-answer' && props}>
        {none => (
          <article class={cx(styles.card, none().class)} aria-label={none()['aria-label'] ?? 'No supported answer'}>
            <EmptyState
              icon={FileQuestion}
              title={none().title ?? 'No supported answer'}
              body={none().body ?? "The approved sources don't cover this. It won't guess."}
              action={none().nextSteps}
            />
          </article>
        )}
      </Match>
      <Match when={props.state === 'unavailable' && props}>
        {down => (
          <article class={cx(styles.card, down().class)} aria-label={down()['aria-label'] ?? 'Answers unavailable'}>
            <div class={styles.unavailable} role="alert">
              <CloudOff class={cx(styles.alertIcon)} aria-hidden="true" />
              <div>
                <strong>{down().title ?? 'Answers are unavailable right now.'}</strong>
                <Show when={down().body}>
                  <p>{down().body}</p>
                </Show>
              </div>
            </div>
            <Show when={down().action}>
              <div class={styles.footer}>{down().action}</div>
            </Show>
          </article>
        )}
      </Match>
    </Switch>
  );
}
