import { For, Show, type JSX } from 'solid-js';
import { BookOpen, Globe, SearchX } from 'lucide-solid';
import type { AnswerOutput } from '@noti/contracts';
import { fill, t } from './ui/i18n';
import { ConfidenceDetails, ConfidenceTag } from './ui/Confidence';
import { FetchedDate, OriginTag } from './ui/Origin';
import { confidenceLevel, sentenceKey } from './ui/confidence-level';
import './ui/thread.css';

export type Turn = { key: string; question: string | undefined; answer?: AnswerOutput };

const statusKey = (status: AnswerOutput['status']) =>
  status === 'abstained' ? 'notEnoughEvidence' : status === 'qualified' ? 'answerWithLimits' : 'answerWithSources';

/** Hover/focus on a chip or card marks its evidence id "hot", so both ends of the link light up. */
export type Linking = {
  citation?: string;
  setCitation?: (id: string) => void;
  hot?: string;
  setHot?: (id: string) => void;
};
const hotHandlers = (props: Linking, id: string) => ({
  onMouseEnter: () => props.setHot?.(id),
  onMouseLeave: () => props.setHot?.(''),
  onFocus: () => props.setHot?.(id),
  onBlur: () => props.setHot?.(''),
});

/** One question and its answer. Citation chips are numbered by their order in the answer's evidence. */
export function TurnView(
  props: Linking & {
    turn: Turn;
    /** Position in a list, for staggered entrances. */
    index?: number;
    /** Name of the school whose staff have not reviewed web pages; omitted when unknown. */
    school?: string | undefined;
    /** The answer was asked in the reader's private space, which has no staff. */
    personal?: boolean;
    children?: JSX.Element;
  },
) {
  const answer = () => props.turn.answer;
  const lang = () => answer()?.language;
  // Web pages are never presented as approved: any cited web evidence adds the notice.
  const webNotice = () => {
    const a = answer();
    if (!a?.evidence.some((e) => e.origin === 'web')) return '';
    if (props.personal) return t(a.language, 'webNoticePersonal');
    return props.school
      ? fill(t(a.language, 'webNotice'), { school: props.school })
      : t(a.language, 'webNoticeGeneric');
  };
  const number = (id: string) => (answer()?.evidence.findIndex((e) => e.id === id) ?? -1) + 1;
  return (
    <article
      class="turn"
      data-key={props.turn.key}
      classList={{ 'stagger-in': props.index !== undefined }}
      style={props.index !== undefined ? { '--i': props.index } : undefined}
      data-status={answer()?.status}
    >
      <Show when={props.turn.question}>
        <div class="turn-question" tabIndex={-1}>
          <span class="sr-only">{t(lang(), 'youAsked')}: </span>
          <p lang={lang()}>{props.turn.question}</p>
        </div>
      </Show>
      <Show when={answer()}>
        {(a) => (
          <div class="turn-answer" lang={a().language}>
            <p class="answer-status" data-status={a().status}>{t(a().language, statusKey(a().status))}</p>
            <Show when={a().confidence !== null ? { value: a().confidence! } : undefined} keyed>
              {(overall) => (
                <p class="answer-confidence">
                  <ConfidenceTag value={overall.value} lang={a().language} />
                  <span>{t(a().language, sentenceKey[confidenceLevel(overall.value)])}</span>
                </p>
              )}
            </Show>
            <Show when={webNotice()}>
              {(notice) => (
                <p class="web-notice" role="note">
                  <Globe size={16} aria-hidden="true" />
                  <span>{notice()}</span>
                </p>
              )}
            </Show>
            <Show
              when={a().status !== 'abstained'}
              fallback={
                <div class="abstain">
                  <SearchX size={22} aria-hidden="true" />
                  <div>
                    <p>{a().explanation || t(a().language, 'noCoverage')}</p>
                    <p class="abstain-next">{t(a().language, 'nextSteps')}</p>
                    <ul>
                      <li><a href="#/sources">{t(a().language, 'browseSources')}</a></li>
                      <li>{t(a().language, 'rephrase')}</li>
                      <li>{t(a().language, 'askOffice')}</li>
                    </ul>
                  </div>
                </div>
              }
            >
              <For each={a().claims}>
                {(claim) => (
                  <p class="claim">
                    {claim.text}
                    <span class="citation-buttons">
                      <For each={claim.evidence_ids}>
                        {(id) => (
                          <Show
                            when={props.setCitation}
                            fallback={<span class="citation-chip">{number(id)}</span>}
                          >
                            <button
                              title={t(a().language, 'openCitation')}
                              aria-label={`Open source citation ${number(id)}`}
                              aria-pressed={props.citation === id}
                              data-hot={props.hot === id && props.citation !== id ? 'true' : undefined}
                              onClick={() => props.setCitation?.(id)}
                              {...hotHandlers(props, id)}
                            >
                              <BookOpen size={14} />
                              {number(id)}
                            </button>
                          </Show>
                        )}
                      </For>
                    </span>
                    <Show when={claim.confidence !== null}>
                      <ConfidenceTag class="claim-confidence" value={claim.confidence} lang={a().language} />
                    </Show>
                  </p>
                )}
              </For>
              <Show when={a().explanation}>
                <p class="answer-note">{a().explanation}</p>
              </Show>
            </Show>
            {props.children}
          </div>
        )}
      </Show>
    </article>
  );
}

/** Numbered source cards for one answer, matching the chip numbers in the answer text. */
export function SourceList(
  props: Linking & {
    answer: AnswerOutput;
    /** The answer belongs to the reader's private space, where a kept page reads "Saved by you". */
    personal?: boolean | undefined;
  },
) {
  const lang = () => props.answer.language;
  return (
    <ol class="source-list">
      <For each={props.answer.evidence}>
        {(e, i) => {
          const body = () => (
            <>
              <span class="source-number" aria-hidden="true">{i() + 1}</span>
              <span>
                {e.title}
                <small>
                  {e.version_label} ·{' '}
                  {e.locator.page ? `${t(lang(), 'page')} ${e.locator.page}` : e.locator.section}
                </small>
              </span>
            </>
          );
          return (
            <li data-evidence={e.id}>
              <Show when={props.setCitation} fallback={<div class="source-citation static">{body()}</div>}>
                <button
                  class="source-citation"
                  aria-pressed={props.citation === e.id}
                  data-hot={props.hot === e.id && props.citation !== e.id ? 'true' : undefined}
                  onClick={() => props.setCitation?.(e.id)}
                  {...hotHandlers(props, e.id)}
                >
                  {body()}
                </button>
              </Show>
              <div class="source-meta">
                <OriginTag origin={e.origin} domain={e.domain} lang={lang()} personal={props.personal} />
                <Show when={e.origin === 'web'}>
                  <FetchedDate at={e.retrieved_at} lang={lang()} />
                </Show>
                <ConfidenceDetails confidence={e.confidence} lang={lang()} />
              </div>
            </li>
          );
        }}
      </For>
    </ol>
  );
}
