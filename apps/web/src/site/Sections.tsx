// intent: content blocks shared by the marketing pages (approval workflow, document types, closing call to action).
// status: done
// next: the landing has its own sections in src/landing; keep these for the secondary pages only.
// confidence: high
import { createSignal, For, Show } from 'solid-js';
import BookOpen from 'lucide-solid/icons/book-open';
import FileText from 'lucide-solid/icons/file-text';
import Library from 'lucide-solid/icons/library';
import ListChecks from 'lucide-solid/icons/list-checks';
import { Dynamic } from 'solid-js/web';
import { Band } from './Band';
import { Button } from '../ui';

const stages = [
  {
    label: 'Collect',
    title: 'Start with documents you can stand behind.',
    body: 'Identify the handbooks, course information and procedures students actually ask about. Establish who owns each source before proposing an upload or official URL.',
    detail: 'Source owner · document scope · original location',
  },
  {
    label: 'Review',
    title: 'Read what the system will read.',
    body: 'Check extracted passages, page boundaries and version information. Unreadable scans and incomplete material need attention before a source can support an answer.',
    detail: 'Readable text · version · effective dates',
  },
  {
    label: 'Publish',
    title: 'Make an approved version available.',
    body: 'An authorized administrator at your school approves the source and checks indexing status. A submitted file alone is not a published source, and a new version should not quietly inherit trust.',
    detail: 'Approval · current version · indexing status',
  },
  {
    label: 'Improve',
    title: 'Use questions to find information gaps.',
    body: 'Review reported answers, outdated sources and ingestion failures. Correct the source or its metadata, then review the update before making it available to students.',
    detail: 'Student feedback · source correction · renewed review',
  },
] as const;

export function Workflow() {
  const [stage, setStage] = createSignal(0);
  return (
    <div class="site-workflow">
      <div class="site-process-controls" role="group" aria-label="Document approval stages">
        <For each={stages}>
          {(item, index) => (
            <button
              type="button"
              aria-pressed={stage() === index()}
              aria-controls="workflow-preview"
              onClick={() => setStage(index())}
            >
              <span aria-hidden="true">0{index() + 1}</span>
              {item.label}
            </button>
          )}
        </For>
      </div>
      <div id="workflow-preview" class="site-card site-process-preview" aria-live="polite">
        <Show when={stages[stage()]} keyed>
          {(item) => (
            <div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <p class="site-meta">{item.detail}</p>
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

export function DocumentRows() {
  const rows = [
    {
      icon: BookOpen,
      title: 'Handbooks and regulations',
      detail: 'Find a rule in context, with its section and version.',
    },
    {
      icon: Library,
      title: 'Course information',
      detail: 'Connect a course question to the document that describes it.',
    },
    {
      icon: FileText,
      title: 'Forms and procedures',
      detail: 'Locate the relevant form and read the steps around it.',
    },
    {
      icon: ListChecks,
      title: 'FAQs and guidance',
      detail: 'Return to the original explanation when an answer needs context.',
    },
  ];
  return (
    <div class="site-document-rows">
      <For each={rows}>
        {(item) => (
          <div class="site-card">
            <span class="site-icon-tile" aria-hidden="true">
              <Dynamic component={item.icon} size={20} />
            </span>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
          </div>
        )}
      </For>
    </div>
  );
}

export function Closing(props: { motion: boolean }) {
  return (
    <Band motion={props.motion} class="site-closing">
      <div class="site-card site-closing-card">
        <h2>Start with what you need to know.</h2>
        <p>Ask about your university in English or Vietnamese, or bring noti.school to your school.</p>
        <div class="site-actions">
          <Button variant="primary" href="#/">
            Ask a question
          </Button>
          <Button href="#join">Request your university</Button>
        </div>
      </div>
    </Band>
  );
}
