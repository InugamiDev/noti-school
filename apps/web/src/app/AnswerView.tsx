// intent: /answer route body on the Clay kit: school from Me, AnswerCard states (loading with Stop, supported, qualified,
//         no supported answer, unavailable), citation chips with source excerpts, feedback and the follow-up composer.
// status: done
// next: App still owns every request, signal and scope rule; this component only renders state and reports intent.
// confidence: high for wiring; visual parity checked by screenshot only
import type { AnswerOutput } from '@noti/contracts';
import { ArrowLeft, Info, MessageSquare, School, TriangleAlert } from 'lucide-solid';
import { For, Show, type JSX } from 'solid-js';
import {
  AnswerCard,
  Badge,
  Button,
  CitationChip,
  cx,
  EmptyState,
  LoadingRegion,
  Passage,
  Skeleton,
  SkeletonText,
  SourceExcerpt,
} from '../ui';
import {
  answerPresentation,
  citationIndex,
  citationText,
  evidenceLocator,
  isAccessCode,
  isUnavailableCode,
} from './workspace';
import { FeedbackForm } from './FeedbackForm';
import type { SessionState } from './session';
import page from './Page.module.scss';
import styles from './Workspace.module.scss';

export interface AnswerViewProps {
  /** School name from the Me membership; undefined when signed out or not a member. */
  school: string | undefined;
  session: SessionState;
  /** Identity, the school list or capabilities are still resolving, so the school line is not known yet. */
  schoolPending: boolean;
  demo: boolean;
  busy: boolean;
  error: string;
  /** RequestError code of the last ask failure, if any. */
  errorCode: string | undefined;
  answer: AnswerOutput | undefined;
  citation: string;
  onCitation: (id: string) => void;
  onStop: () => void;
  onRephrase: () => void;
  feedbackOpen: boolean;
  onFeedbackToggle: () => void;
  feedbackMessage: string;
  onFeedbackMessage: (message: string) => void;
  institution: string;
  /** Follow-up composer (PromptInput), owned by App. */
  composer: JSX.Element;
  /** Citation reader for the selected evidence, owned by App so it remounts on scope change. */
  reader: JSX.Element;
}

export function AnswerView(props: AnswerViewProps) {
  const chip = (answer: AnswerOutput, id: string) => {
    const index = citationIndex(answer, id);
    return (
      <CitationChip
        index={index}
        pressed={props.citation === id}
        label={`Citation ${index}: open source`}
        onSelect={() => props.onCitation(id)}
      />
    );
  };
  const reportButton = () => (
    <Button variant="ghost" size="sm" aria-expanded={props.feedbackOpen} onClick={() => props.onFeedbackToggle()}>
      <MessageSquare aria-hidden="true" />
      Report an issue
    </Button>
  );
  return (
    <div class={styles.workspace}>
      <div class={styles.main}>
        <Button variant="ghost" size="sm" href="#/" class={styles.back}>
          <ArrowLeft aria-hidden="true" />
          New question
        </Button>
        <h1 id="answer-heading" class={styles.title} tabIndex={-1}>
          Your answer
        </h1>
        <LoadingRegion
          loading={props.schoolPending}
          label="Loading your school…"
          innerClass={styles.school}
          skeleton={
            <>
              <SkeletonText class={styles.schoolSkeleton} />
              <Skeleton class={styles.badgeSkeleton} width="17rem" height="26px" />
            </>
          }
        >
          <Show
            when={props.school}
            fallback={
              <span>
                {props.session === 'signed-in' ? 'No school membership on this account.' : 'Not signed in.'}
              </span>
            }
          >
            {(name) => (
              <span class={styles.schoolName}>
                <School size={16} aria-hidden="true" />
                {name()}
              </span>
            )}
          </Show>
          <Show when={props.demo}>
            <Badge tone="clay">Demo collection, synthetic examples only</Badge>
          </Show>
        </LoadingRegion>
        <Show when={props.busy}>
          <AnswerCard state="loading" progress="Finding an answer and its sources…" onStop={() => props.onStop()} />
        </Show>
        <Show when={props.error}>
          <Show
            when={isUnavailableCode(props.errorCode)}
            fallback={
              <div
                class={cx(page.notice, props.errorCode !== 'cancelled' && page.error)}
                role="alert"
              >
                <Show when={props.errorCode === 'cancelled'} fallback={<TriangleAlert size={18} aria-hidden="true" />}>
                  <Info size={18} aria-hidden="true" />
                </Show>
                <div class={page.noticeBody}>
                  <p>{props.error}</p>
                  <div class={page.links}>
                    <Show when={isAccessCode(props.errorCode) || props.session === 'signed-out'}>
                      <Button size="sm" href="#/auth">
                        Sign in
                      </Button>
                    </Show>
                    <Button size="sm" variant="ghost" href="#/sources">
                      Browse sources
                    </Button>
                  </div>
                </div>
              </div>
            }
          >
            <AnswerCard
              state="unavailable"
              body={props.error}
              action={
                <Button size="sm" href="#/sources">
                  Browse sources
                </Button>
              }
            />
          </Show>
        </Show>
        <Show when={!props.busy && !props.error && !props.answer}>
          <EmptyState
            icon={MessageSquare}
            title="No answer on screen"
            body="Ask a question below. Answers use only your school's approved documents and show where they came from."
          />
        </Show>
        <Show when={props.answer}>
          {(a) => {
            const view = () => answerPresentation(a().status);
            return (
              <>
                <Show
                  when={view().card === 'answer'}
                  fallback={
                    <AnswerCard
                      state="no-answer"
                      aria-label={view().label}
                      title={view().label}
                      body={a().explanation ?? undefined}
                      nextSteps={
                        <>
                          <Button size="sm" href="#/sources">
                            Browse sources
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => props.onRephrase()}>
                            Rephrase
                          </Button>
                          {reportButton()}
                        </>
                      }
                    />
                  }
                >
                  <AnswerCard
                    state="answer"
                    aria-label={view().label}
                    class={a().status === 'qualified' ? styles.qualified : undefined}
                    badge={
                      <Badge tone={view().tone} dot>
                        {view().label}
                      </Badge>
                    }
                    footer={reportButton()}
                  >
                    <Show when={a().status === 'qualified' && a().explanation}>
                      {(explanation) => (
                        <p class={styles.limitation}>
                          <Info size={18} aria-hidden="true" />
                          <span>{explanation()}</span>
                        </p>
                      )}
                    </Show>
                    <For each={a().claims}>
                      {(claim) => (
                        <p class={styles.claim} data-claim>
                          {claim.text}
                          <span class={styles.chips}>
                            <For each={claim.evidence_ids}>{(id) => chip(a(), id)}</For>
                          </span>
                        </p>
                      )}
                    </For>
                    <Show when={a().status !== 'qualified' && a().explanation}>
                      {(explanation) => <p class={styles.note}>{explanation()}</p>}
                    </Show>
                  </AnswerCard>
                </Show>
                <Show when={props.feedbackOpen}>
                  <FeedbackForm
                    answerId={a().id}
                    institution={props.institution}
                    message={props.feedbackMessage}
                    onMessage={props.onFeedbackMessage}
                  />
                </Show>
              </>
            );
          }}
        </Show>
        <section class={styles.followUp} aria-labelledby="follow-up-heading">
          <h2 id="follow-up-heading" class={styles.h2}>
            Ask a follow-up
          </h2>
          {props.composer}
        </section>
      </div>
      <aside class={styles.aside} aria-labelledby="sources-heading">
        <h2 id="sources-heading" class={styles.h2}>
          Supporting sources
        </h2>
        <Show
          when={props.answer?.evidence.length ? props.answer : undefined}
          fallback={
            <p class={page.muted}>
              {props.answer ? 'No passage supports an answer to this question.' : 'Sources will appear with the answer.'}
            </p>
          }
        >
          {(a) => (
            <For each={a().evidence}>
              {(e, i) => (
                <div class={styles.excerpt}>
                  <div class={styles.excerptHead}>
                    <span class={styles.excerptNumber}>Source {i() + 1}</span>
                    <Button size="sm" variant="ghost" aria-pressed={props.citation === e.id} onClick={() => props.onCitation(e.id)}>
                      Open in reader
                    </Button>
                  </div>
                  <SourceExcerpt locator={evidenceLocator(e)} citation={citationText(e)} activePassage={props.citation}>
                    <Passage id={e.id}>{e.quote}</Passage>
                  </SourceExcerpt>
                </div>
              )}
            </For>
          )}
        </Show>
        {props.reader}
      </aside>
    </div>
  );
}
