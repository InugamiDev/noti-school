// intent: landing hero: headline, the real question composer (PromptInput + SchoolPicker), sample question chips,
//         and the ClayHero stage with the sample answer card overlapping its base. No proof row: the sections below
//         make those claims with evidence.
// status: done
// next: the composer submit is owned by App (routes to /answer); this module only renders and reports intent.
// confidence: high for wiring; visual parity checked by screenshot only
import { School } from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';
import { ClayHero } from '../hero3d/ClayHero';
import type { Citation, HeroScope } from '../hero3d/layout';
import {
  AnswerCard,
  Badge,
  Button,
  Chip,
  CitationChip,
  Passage,
  PromptInput,
  SchoolPicker,
  SourceExcerpt,
  looksVietnamese,
  type AnswerLanguage,
  type School as SchoolOption,
} from '../ui';
import { sampleQuestions } from './logic';
import styles from './Landing.module.scss';

export interface ComposerProps {
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  language: AnswerLanguage;
  onLanguage: (language: AnswerLanguage) => void;
  schools: readonly SchoolOption[];
  /** Selected school id, or 'request' while previewing an unlisted university. */
  school: string;
  onSchool: (id: string) => void;
  /** Shown when the institution list is unavailable. */
  schoolFallback: string;
  coverage: string;
  error: string;
  textareaRef: (element: HTMLTextAreaElement) => void;
  /** Receives the element wrapping the school picker trigger, so the command menu can open it. */
  pickerRef: (element: HTMLElement) => void;
}

export interface HeroProps extends ComposerProps {
  scope: HeroScope;
  schoolLabel: string;
  onFocusAsk: () => void;
}

const SAMPLE_CITATION = 'Sample Student Handbook, 2025 edition, page 31, section 4.2';

export function Hero(props: HeroProps) {
  const [citation, setCitation] = createSignal<Citation>('a');
  const cite = (id: Citation, index: number) => (
    <CitationChip index={index} pressed={citation() === id} onSelect={() => setCitation(id)} />
  );
  return (
    <section class={styles.hero} aria-labelledby="landing-title">
      <div class={`site-wrap ${styles.heroGrid}`}>
        <div class={styles.heroCopy}>
          <h1 id="landing-title" class={styles.title} tabIndex={-1}>
            University answers you can check.
          </h1>
          <p class={styles.heroSub}>
            Ask about your university's rules in English or Vietnamese. Answers use only your
            school's approved documents and show the page they came from.
          </p>
          <PromptInput
            value={props.draft}
            onInput={props.onDraft}
            onSubmit={() => props.onSubmit()}
            pending={props.pending}
            language={props.language}
            onLanguage={props.onLanguage}
            placeholder={
              props.language === 'vi' ? 'Hỏi về hạn chót, biểu mẫu hoặc quy định' : 'Ask about a deadline, form or rule'
            }
            textareaRef={props.textareaRef}
            school={() => (
              <span class={styles.picker} ref={props.pickerRef}>
                <SchoolPicker
                  schools={props.schools}
                  value={props.school}
                  onChange={props.onSchool}
                  fallbackLabel={props.school === 'request' ? 'Your university' : props.schoolFallback}
                />
              </span>
            )}
          />
          <p class={styles.coverage}>{props.coverage}</p>
          <Show when={props.error}>
            <p role="alert" class={styles.error}>
              {props.error}
            </p>
          </Show>
          <div class={styles.try} role="group" aria-label="Sample questions">
            <For each={sampleQuestions}>
              {question => (
                <Chip
                  lang={looksVietnamese(question) ? 'vi' : 'en'}
                  onClick={() => {
                    props.onDraft(question);
                    if (looksVietnamese(question)) props.onLanguage('vi');
                    props.onFocusAsk();
                  }}
                >
                  {question}
                </Chip>
              )}
            </For>
          </div>
        </div>
        <div class={styles.stage}>
          <ClayHero activeCitation={citation()} scope={props.scope} schoolLabel={props.schoolLabel} />
          <div class={styles.stageCard} aria-live="polite">
            <Show
              when={props.scope === 'request'}
              fallback={
                <AnswerCard
                  state="answer"
                  aria-label="Example answer"
                  badge={<Badge>Sample handbook, not HCMIU policy</Badge>}
                >
                  <p class={styles.answerText}>
                    You can withdraw from a course until the end of week{' '}
                    <span class={styles.keep}>10{cite('a', 1)}.</span> Later withdrawals need the
                    dean's <span class={styles.keep}>approval{cite('b', 2)}.</span>
                  </p>
                  <SourceExcerpt
                    locator="Sample Handbook, 2025 · p. 31 · sec. 4.2"
                    citation={SAMPLE_CITATION}
                    activePassage={citation()}
                  >
                    Students may withdraw from a course <Passage id="a">until the end of the tenth week</Passage> of
                    the semester.{' '}
                    <Passage id="b">After this point, a withdrawal requires approval from the dean.</Passage>
                  </SourceExcerpt>
                </AnswerCard>
              }
            >
              <article class={`${styles.card} ${styles.requestCard}`} aria-label="Your university">
                <span class={styles.requestIcon} aria-hidden="true">
                  <School size={20} />
                </span>
                <h2 class={styles.requestTitle}>Your university isn't set up yet</h2>
                <p>
                  Answers only come from documents your school has approved, so there's nothing to answer
                  from yet. See below how your university can join.
                </p>
                <Button variant="primary" size="sm" href="#join">
                  Request your university
                </Button>
              </article>
            </Show>
          </div>
        </div>
      </div>
    </section>
  );
}
