import { createSignal, For, Show } from 'solid-js';
import { ArrowRight, BookOpen, Check, ChevronRight, FileText } from 'lucide-solid';

const examples = [
  {
    question: 'How do I request an official transcript?',
    answer:
      'Request it from the Student Services portal under “Records”, then collect the stamped copy from the Registry desk.',
    title: 'Student Services Handbook',
    locator: 'Section 4.2 · Transcripts',
    version: '2026–27 edition',
    passage:
      'Official transcripts are requested through the Student Services portal under “Records”. Stamped copies are collected in person from the Registry desk.',
  },
  {
    question: 'Which course change form should I use?',
    answer:
      'Use form CC-2. It replaced CC-1, which is kept in the archive for reference and is no longer accepted.',
    title: 'Academic Forms Index',
    locator: 'Page 3 · Course changes',
    version: 'Revised edition',
    passage:
      'Form CC-2 replaces CC-1 for all course changes. CC-1 remains in the archive for reference and is no longer accepted.',
  },
] as const;

// intent: an inspectable example of a fictional university; no live request or institution data.
export default function ProductExample() {
  const [selected, setSelected] = createSignal(0);
  const [sourceOpen, setSourceOpen] = createSignal(false);
  const example = () => examples[selected()]!;
  let source!: HTMLDivElement;
  return (
    <div class="site-example" data-testid="product-example">
      <div class="site-example-label">
        <span>
          <BookOpen size={17} /> Example
        </span>
        <span>Example University</span>
      </div>
      <div class="site-example-questions" role="group" aria-label="Example questions">
        <For each={examples}>
          {(item, index) => (
            <button
              aria-pressed={selected() === index()}
              onClick={() => {
                setSelected(index());
                setSourceOpen(false);
              }}
            >
              {item.question}
              <ArrowRight size={16} />
            </button>
          )}
        </For>
      </div>
      <div class="site-evidence-grid">
        <section class="site-example-answer" aria-label="Example answer" aria-live="polite">
          <span class="site-label">Answer</span>
          <Show when={example()} keyed>
            {(item) => (
              <div class="site-fade">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
                <button
                  class="site-citation"
                  aria-label="View example source"
                  aria-expanded={sourceOpen()}
                  onClick={() => {
                    setSourceOpen(true);
                    queueMicrotask(() => {
                      source.focus({ preventScroll: true });
                      source.scrollIntoView({ block: 'nearest', behavior: 'instant' });
                    });
                  }}
                >
                  <FileText size={17} />
                  <span>
                    View example source<small>{item.title}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </Show>
        </section>
        <div
          ref={(node) => {
            source = node;
          }}
          tabIndex={-1}
          class="site-example-source"
          role="region"
          aria-label="Example source"
        >
          <Show
            when={sourceOpen()}
            fallback={
              <div class="site-source-prompt">
                <FileText size={28} />
                <h3>Read the evidence.</h3>
                <p>Open the source to see the exact passage behind this answer.</p>
              </div>
            }
          >
            <div class="site-fade">
              <span class="site-label">
                <Check size={15} /> Source passage
              </span>
              <h3>{example().title}</h3>
              <p class="site-source-locator">
                {example().version}
                <br />
                {example().locator}
              </p>
              <blockquote>{example().passage}</blockquote>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
