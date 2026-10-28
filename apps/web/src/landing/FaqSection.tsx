// intent: landing FAQ with a live filter that ignores case and Vietnamese diacritics; matches open automatically.
// status: done
// next: content lives in site/faq.ts and is shared with the Help page.
// confidence: high
import { createMemo, createSignal, Show } from 'solid-js';
import { Band } from '../site/Band';
import { questions } from '../site/faq';
import { Accordion, matchesQuery, SearchInput } from '../ui';
import styles from './Landing.module.scss';

const landingQuestions = questions.filter(item => item.landing);

export function FaqSection(props: { motion: boolean; onAsk: (text: string) => void }) {
  const [query, setQuery] = createSignal('');
  const [open, setOpen] = createSignal<string[]>([]);
  const shown = createMemo(() => landingQuestions.filter(item => matchesQuery(query(), item.question, item.answer)));
  return (
    <Band motion={props.motion} id="faq" labelledby="faq-title">
      <div class="site-wrap">
        <div class={styles.faqHead}>
          <h2 id="faq-title" class={styles.secTitle} tabIndex={-1}>
            Questions
          </h2>
          <SearchInput
            class={styles.faqFilter}
            label="Filter questions"
            placeholder="Filter questions"
            value={query()}
            onInput={value => {
              setQuery(value);
              setOpen(value.trim() ? landingQuestions.filter(item => matchesQuery(value, item.question, item.answer)).map(item => item.id) : []);
            }}
          />
        </div>
        <Accordion
          value={open()}
          onChange={setOpen}
          items={shown().map(item => ({
            value: item.id,
            title: item.question,
            content: (
              <>
                <p>{item.answer}</p>
                <a class={styles.faqLink} href={item.href}>
                  {item.action}
                </a>
              </>
            ),
          }))}
        />
        <p role="status" class={styles.faqEmpty}>
          <Show when={!shown().length}>
            No questions match.{' '}
            <button type="button" class={styles.linkButton} onClick={() => props.onAsk(query().trim())}>
              Ask it instead
            </button>
            .
          </Show>
        </p>
      </div>
    </Band>
  );
}
