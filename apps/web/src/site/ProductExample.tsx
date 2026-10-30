import { createSignal, For, Show } from 'solid-js';
import { FileText } from 'lucide-solid';
import { Badge, Button } from '../ui';

const examples = [
  {
    question: 'Where is the practice handbook?',
    answer:
      'In this example, open the Sample Library and choose “Practice handbook”. The document index identifies the current example version.',
    title: 'Sample Library guide',
    locator: 'Section 1 · Finding a document',
    version: 'Example version A',
    passage:
      'The Sample Library lists the Practice handbook in its document index. Select “Practice handbook” to open it. The index marks the current example version beside the title.',
    limit: 'This passage gives a location. It does not establish any university rule.',
  },
  {
    question: 'Which version of the sample form should I use?',
    answer:
      'Use version B of the Practice request form in this fictional collection. Version A is archived and is kept only for reference.',
    title: 'Practice request form, version note',
    locator: 'Section 2 · Version history',
    version: 'Example version B',
    passage:
      'Practice request form, version B, replaces version A in this sample collection. Version A is archived for reference and should not be used for a new practice request.',
    limit: 'No real form, submission deadline or eligibility requirement is represented here.',
  },
] as const;

// intent: an inspectable, synthetic example with no live request or institution data; status: implemented.
export default function ProductExample() {
  const [selected, setSelected] = createSignal(0);
  const [sourceOpen, setSourceOpen] = createSignal(false);
  const example = () => examples[selected()]!;
  let source!: HTMLDivElement;
  return (
    <div class="site-example" data-testid="product-example">
      <div class="site-example-label">
        <Badge>Illustrative example</Badge>
        <span>Synthetic collection, not university guidance</span>
      </div>
      <div class="site-example-questions" role="group" aria-label="Example questions">
        <For each={examples}>
          {(item, index) => (
            <button
              type="button"
              aria-pressed={selected() === index()}
              onClick={() => {
                setSelected(index());
                setSourceOpen(false);
              }}
            >
              {item.question}
            </button>
          )}
        </For>
      </div>
      <div class="site-evidence-grid">
        <section class="site-card site-example-answer" aria-label="Example answer" aria-live="polite">
          <Show when={example()} keyed>
            {(item) => (
              <div>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
                <Button
                  size="sm"
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
                  <FileText aria-hidden="true" />
                  View example source
                </Button>
                <p class="site-meta">{item.limit}</p>
              </div>
            )}
          </Show>
        </section>
        <div
          ref={(node) => {
            source = node;
          }}
          tabIndex={-1}
          class="site-card site-example-source"
          role="region"
          aria-label="Example source"
        >
          <Show
            when={sourceOpen()}
            fallback={
              <div class="site-source-prompt">
                <span class="site-icon-tile" aria-hidden="true">
                  <FileText size={20} />
                </span>
                <h3>Read the evidence.</h3>
                <p>Select “View example source” to inspect the exact passage behind this answer.</p>
                <p class="site-meta">No live answer request is made.</p>
              </div>
            }
          >
            <div>
              <Badge tone="sage">Synthetic source passage</Badge>
              <h3>{example().title}</h3>
              <p class="site-locator">
                {example().version} · {example().locator}
              </p>
              <blockquote>{example().passage}</blockquote>
              <p class="site-meta">Written only for this illustration. Not an HCMIU document.</p>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
