import { createEffect, createSignal, For, on, onCleanup, Show, type JSX } from 'solid-js';
import { dur, ease, enter, motionAllowed, pulse, stagger, step } from './ui/motion';
import { LoadingStatus, SkeletonLines } from './ui/Loader';
import { Select } from './ui/Select';
import { MessageSquare } from 'lucide-solid';
import { post, errorText, requestScope } from './api';
import { accessScope } from './resource';
import Sources from './Sources';
import { scoped } from './App';
import { SourceList, TurnView, type Turn } from './Thread';
import { DeleteConversation } from './History';
import { t } from './ui/i18n';
import { formatDate, type Lang } from './ui/format';

// intent: one conversation screen for live and reopened conversations: a uniform thread, a sources
// panel that follows the answer in view (or the chip just clicked), and the follow-up box.
export default function AnswerView(props: {
  institution: string;
  institutionName: string | undefined;
  /** The reader's private space: it has no staff, so web pages are worded as unreviewed by anyone. */
  personal: boolean;
  /** The pending question also searches the web, so the waiting text says so. */
  discovering: boolean;
  /** The private space holds pages its owner saved for answers; without them only the web is searched. */
  savedPages: boolean;
  demo: boolean;
  busy: boolean;
  /** A deep link is rebuilding the thread from saved answers. */
  restoring: boolean;
  /** Why a deep-linked conversation could not be reopened; empty when it could. */
  restoreError: string;
  /** Language of the question being answered, for the pending state. */
  pendingLanguage: Lang;
  error: string;
  authError: boolean;
  turns: Turn[];
  citation: string;
  setCitation: (id: string) => void;
  feedback: string;
  toggleFeedback: (answerId: string) => void;
  feedbackMessage: string;
  setFeedbackMessage: (message: string) => void;
  /** Where the visitor came from decides the back link. */
  origin: 'home' | 'history';
  /** Saved conversation the signed-in owner may remove from history. */
  conversationId: string | undefined;
  canDelete: boolean;
  deleted: (conversationId: string) => void;
  refreshHistory: () => unknown;
  notice: JSX.Element;
  form: JSX.Element;
}) {
  let column: HTMLDivElement | undefined;
  let aside: HTMLElement | undefined;
  const [hot, setHot] = createSignal('');
  // Visible share of each turn, from an IntersectionObserver over the thread.
  const [visible, setVisible] = createSignal<Record<string, number>>({});
  const answered = () => props.turns.filter((turn) => turn.answer);
  const citationTurn = () =>
    props.citation ? answered().find((turn) => turn.answer!.evidence.some((e) => e.id === props.citation)) : undefined;
  // The chip just clicked wins; otherwise the answer most in view; otherwise the latest.
  const activeTurn = () => {
    const cited = citationTurn();
    if (cited) return cited;
    let best: Turn | undefined;
    let bestRatio = 0;
    for (const turn of answered()) {
      const ratio = visible()[turn.key] ?? 0;
      if (ratio > bestRatio) {
        best = turn;
        bestRatio = ratio;
      }
    }
    return best ?? answered().at(-1);
  };
  const activeAnswer = () => activeTurn()?.answer;
  const activeIndex = () => answered().findIndex((turn) => turn === activeTurn()) + 1;
  const lang = (): Lang => (props.busy ? props.pendingLanguage : (activeAnswer()?.language ?? props.pendingLanguage));
  // Reopened conversations carry no question text, so the first answer's date names them.
  const title = () => {
    const first = props.turns[0];
    if (first?.question) return first.question;
    return first?.answer ? `${t(lang(), 'conversationFrom')} ${formatDate(first.answer.created_at, lang())}` : 'Your answer';
  };
  const empty = () => !props.turns.length && !props.busy && !props.restoring;
  // One truthful waiting line. A private space has no approved documents, so it never claims to search them.
  const waitingKey = () =>
    !props.discovering
      ? 'findingAnswer'
      : !props.personal
        ? 'searchingWeb'
        : props.savedPages
          ? 'searchingSavedAndWeb'
          : 'searchingWebOnly';
  // Closing returns focus to the chip that opened the passage.
  const close = () => {
    const chip = column?.querySelector<HTMLElement>('.citation-buttons button[aria-pressed="true"]');
    props.setCitation('');
    queueMicrotask(() => chip?.focus());
  };
  // Opening a citation also lifts its card and brings it into view; opening the same one again closes it.
  const choose = (id: string) => {
    if (props.citation === id) return close();
    props.setCitation(id);
    queueMicrotask(() => {
      const card = aside?.querySelector<HTMLElement>(`[data-evidence="${id}"] .source-citation`);
      if (!card) return;
      card.scrollIntoView({ block: 'nearest', behavior: motionAllowed(card) ? 'smooth' : 'auto' });
      pulse(card);
    });
  };
  // Watch which turn the reader is on. Rebuilt whenever turns are added; disconnected on unmount.
  let observer: IntersectionObserver | undefined;
  createEffect(
    on(
      () => props.turns.length,
      () => {
        observer?.disconnect();
        setVisible({});
        if (typeof IntersectionObserver === 'undefined' || !column) return;
        observer = new IntersectionObserver(
          (entries) => {
            setVisible((current) => {
              const next = { ...current };
              for (const entry of entries) {
                const key = (entry.target as HTMLElement).dataset.key;
                if (key) next[key] = entry.isIntersecting ? entry.intersectionRatio : 0;
              }
              return next;
            });
          },
          { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1], rootMargin: '-15% 0px -35% 0px' },
        );
        for (const turn of column.querySelectorAll<HTMLElement>('.turn[data-key]')) observer.observe(turn);
      },
    ),
  );
  onCleanup(() => observer?.disconnect());
  // A citation whose turn has scrolled fully out of view is stale: close it so the panel can follow.
  createEffect(() => {
    const cited = citationTurn();
    if (!cited || !props.citation) return;
    const ratios = visible();
    const others = answered().some((turn) => turn !== cited && (ratios[turn.key] ?? 0) > 0);
    if (ratios[cited.key] === 0 && others) props.setCitation('');
  });
  // A new question slides into the thread while its answer is pending.
  createEffect(
    on(
      () => props.turns.length,
      () => {
        const last = column?.querySelector('.turn:last-of-type');
        if (!last || last.querySelector('.turn-answer')) return;
        enter(last.querySelectorAll('.turn-question'), { opacity: [0, 1], y: [10, 0], scale: [0.97, 1] }, { duration: dur.md });
      },
      { defer: true },
    ),
  );
  // Arrival choreography: status, then sentences settle, chips pop, and the source cards stack in the
  // same order. Earlier turns stay still; everything is already in place under reduced or paused motion.
  createEffect(
    on(
      () => props.turns.at(-1)?.answer,
      (answer) => {
        if (!answer || !column) return;
        const last = column.querySelector('.turn:last-of-type');
        if (!last || !motionAllowed(last)) return;
        enter(last.querySelectorAll('.answer-status, .answer-confidence, .web-notice'), { opacity: [0, 1] }, { duration: dur.sm });
        enter(
          last.querySelectorAll('.claim, .abstain, .answer-note'),
          { opacity: [0, 1], y: [8, 0] },
          { duration: dur.md, delay: stagger(step, { startDelay: 0.05 }) },
        );
        enter(
          last.querySelectorAll('.citation-buttons button'),
          { opacity: [0, 1], scale: [0.6, 1] },
          { duration: dur.md, ease: ease.spring, delay: stagger(step, { startDelay: 0.22 }) },
        );
        enter(last.querySelectorAll('.report-button'), { opacity: [0, 1] }, { duration: dur.sm, delay: 0.3 });
        enter(
          aside?.querySelectorAll('.source-list > li'),
          { opacity: [0, 1], x: [14, 0] },
          { duration: dur.md, delay: stagger(0.06, { startDelay: 0.26 }) },
        );
      },
    ),
  );
  return (
    <div class="workspace" classList={{ 'reader-open': !!props.citation }}>
      <div class="answer-column" ref={column}>
        <div class="thread-head">
          <Show
            when={props.origin === 'history'}
            fallback={
              <a href="#/" class="back" lang={lang()}>
                ← {t(lang(), 'newQuestion')}
              </a>
            }
          >
            <a href="#/history" class="back" lang={lang()}>
              ← {t(lang(), 'allConversations')}
            </a>
          </Show>
          <h1 id="answer-heading" tabIndex={-1} class="thread-title compact" lang={lang()}>
            {title()}
          </h1>
          <p class="muted thread-meta">
            {props.personal ? t(lang(), 'mySpace') : props.institutionName}
            {props.demo ? ' · Demo' : ''}
            <Show when={answered().length > 1}>
              {` · ${answered().length} ${t(lang(), 'answersCount')}`}
            </Show>
          </p>
        </div>
        <Show when={props.restoring}>
          <div class="answer-loading">
            <LoadingStatus>{t(lang(), 'reopening')}</LoadingStatus>
            <SkeletonLines lines={3} class="answer-skeleton" />
          </div>
        </Show>
        <Show when={empty()}>
          <div class="thread-empty" role="status">
            <p>{props.restoreError || t(lang(), 'nothingYet')}</p>
            <div class="actions">
              <a class="primary thread-empty-action" href="#/">{t(lang(), 'askQuestion')}</a>
              <Show when={props.restoreError}>
                <a href="#/auth">Sign in</a>
                <a href="#/history">History</a>
              </Show>
            </div>
          </div>
        </Show>
        <div class="thread">
          <For each={props.turns}>
            {(turn) => (
              <TurnView
                turn={turn}
                citation={props.citation}
                setCitation={choose}
                hot={hot()}
                setHot={setHot}
                school={props.institutionName}
                personal={props.personal}
              >
                <Show when={turn.answer}>
                  {(a) => (
                    <>
                      <button class="report-button" onClick={() => props.toggleFeedback(a().id)}>
                        <MessageSquare size={16} />
                        {t(a().language, 'reportIssue')}
                      </button>
                      <Show when={props.feedback === a().id}>
                        <form
                          class="stack feedback-form"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const data = new FormData(e.currentTarget);
                            const owner = requestScope();
                            props.setFeedbackMessage('Sending…');
                            try {
                              await post(scoped(props.institution, '/feedback'), 'Feedback', {
                                answer_id: a().id,
                                category: data.get('category'),
                                comment: data.get('comment'),
                              });
                              if (!owner.aborted) props.setFeedbackMessage('Feedback received. Thank you.');
                            } catch (err) {
                              if (!owner.aborted) props.setFeedbackMessage(errorText(err));
                            }
                          }}
                        >
                          <Select
                            label="Issue"
                            name="category"
                            options={[
                              { value: 'unsupported', label: 'Unsupported claim' },
                              { value: 'incorrect', label: 'Incorrect' },
                              { value: 'outdated', label: 'Outdated' },
                              { value: 'other', label: 'Other' },
                            ]}
                          />
                          <label>
                            Comment
                            <textarea name="comment" maxLength={2000} />
                          </label>
                          <button type="submit">Send feedback</button>
                          <p role="status">{props.feedbackMessage}</p>
                        </form>
                      </Show>
                    </>
                  )}
                </Show>
              </TurnView>
            )}
          </For>
          <Show when={props.busy}>
            <div class="answer-loading">
              {/* One truthful line: the API returns a single final answer, so there are no step updates. */}
              <LoadingStatus>{t(props.pendingLanguage, waitingKey())}</LoadingStatus>
              <SkeletonLines lines={3} class="answer-skeleton" />
            </div>
          </Show>
        </div>
        <Show when={props.error}>
          <div class="notice" role="alert">
            <p>{props.error}</p>
            <Show when={props.authError}>
              <a href="#/auth">Sign in</a> ·{' '}
            </Show>
            <a href="#/sources">Browse sources</a>
            <Show when={!props.authError}>
              {' '}·{' '}
              <button
                type="button"
                class="link-button"
                onClick={() => document.getElementById('question')?.closest('form')?.requestSubmit()}
              >
                {t(lang(), 'tryAgain')}
              </button>
            </Show>
          </div>
        </Show>
      </div>
      <Show when={props.citation}>
        <div class="reader-backdrop" onClick={close} />
      </Show>
      <aside
        lang={lang()}
        ref={aside}
        aria-live="polite"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && props.citation && !e.defaultPrevented) {
            e.preventDefault();
            close();
          }
        }}
      >
        <h2>{t(lang(), 'supportingSources')}</h2>
        <Show when={answered().length > 1 && activeAnswer()}>
          <p class="sources-of" role="status">
            {t(lang(), 'answerN')} {activeIndex()} {t(lang(), 'of')} {answered().length}
          </p>
        </Show>
        <Show
          when={!props.busy || activeAnswer()}
          fallback={
            <div class="sources-pending">
              <p class="muted">{t(lang(), 'checkingSources')}</p>
              <div class="skeleton-card" aria-hidden="true">
                <span class="skeleton-dot" />
                <div><span class="skeleton-line" style={{ width: '70%' }} /><span class="skeleton-line short" style={{ width: '40%' }} /></div>
              </div>
            </div>
          }
        >
          <Show
            when={activeAnswer()?.evidence.length}
            fallback={
              <p class="muted">
                {activeAnswer()?.status === 'abstained' ? t(lang(), 'noCoverage') : t(lang(), 'sourcesAppear')}
              </p>
            }
          >
            <SourceList answer={activeAnswer()!} citation={props.citation} setCitation={choose} hot={hot()} setHot={setHot} personal={props.personal} />
          </Show>
        </Show>
        <Show when={props.citation}>
          <Show when={accessScope()} keyed>
            {(_scope) => <Sources institution={props.institution} citation={props.citation} lang={lang()} personal={props.personal} onClose={close} />}
          </Show>
        </Show>
      </aside>
      <div class="followup">
        <h2 lang={lang()}>{t(lang(), 'askFollowUp')}</h2>
        {props.notice}
        {props.form}
        <Show when={props.canDelete && props.conversationId}>
          {(id) => (
            <DeleteConversation
              institution={props.institution}
              id={id()}
              deleted={props.deleted}
              refreshHistory={props.refreshHistory}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
