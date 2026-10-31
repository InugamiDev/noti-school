import { createSignal, For, Show } from 'solid-js';
import {
  ArrowRight,
  BookOpen,
  FileText,
  Languages,
  Library,
  ListChecks,
} from 'lucide-solid';
import { Band } from './Band';
import ProductExample from './ProductExample';
import CollectionPreview from '../CollectionPreview';
import { Kinetic, Marquee, Story } from './Flash';

export const questions = [
  {
    category: 'Answers',
    question: 'Can I ask in Vietnamese?',
    answer:
      'Yes. Choose Tiếng Việt in the question composer, or English. You can switch for any question.',
    href: '#/',
    action: 'Go to the question composer',
  },
  {
    category: 'Sources',
    question: 'Does noti.school have all HCMIU documents?',
    answer:
      'Not yet. The collection grows as documents are reviewed and published. The source library shows every document available to your account, with its version.',
    href: '#/sources',
    action: 'Check source availability',
  },
  {
    category: 'Answers',
    question: 'What if there is no supported answer?',
    answer:
      'noti.school tells you so instead of guessing. Try a more specific question, browse the source library, or ask the responsible university office.',
    href: '#/sources',
    action: 'Look for a source',
  },
  {
    category: 'Accounts',
    question: 'How do I join the pilot?',
    answer:
      'The pilot is invitation-only. If you have an invitation, create your account or sign in with Google. Otherwise, get in touch and we will follow up.',
    href: '#/auth',
    action: 'Open your account',
  },
  {
    category: 'Sources',
    question: 'Can I report an incorrect answer?',
    answer:
      'Use the feedback action on an answer. Identify the claim and the relevant source passage. Avoid including student IDs, personal records or other sensitive information in a report.',
    href: '#/history',
    action: 'Find a previous answer',
  },
  {
    category: 'Pilot',
    question: 'Is this an official university service?',
    answer:
      'No. noti.school is an independent service and is not affiliated with any university. For important decisions, confirm with the original document and the responsible office.',
    href: '#/about',
    action: 'About the project',
  },
  {
    category: 'Accounts',
    question: 'Why can’t I sign in or reset my password?',
    answer:
      'The account page shows when sign-in or email is temporarily unavailable. Your question draft stays in this tab, so you can come back to it. Contact us if it keeps happening.',
    href: '#/contact',
    action: 'Get access help',
  },
  {
    category: 'Answers',
    question: 'Why did my answer stop or become unavailable?',
    answer:
      'A stopped request may still finish in the background. Ask the same question again and noti.school picks up the same request instead of starting over.',
    href: '#/answer',
    action: 'Return to the answer workspace',
  },
  {
    category: 'Sources',
    question: 'Why can’t I open a source?',
    answer:
      'The document may be restricted to a different institution or account, or a version may no longer be current. Sign in with the right account and check the library. A citation does not grant access to a restricted document.',
    href: '#/sources',
    action: 'Open the source library',
  },
  {
    category: 'Pilot',
    question: 'Can my institution contribute documents?',
    answer:
      'Start by discussing scope, ownership and who can approve updates. A proposed document is not answer evidence until it has been reviewed and published into the collection.',
    href: '#/universities',
    action: 'Explore institutional participation',
  },
] as const;

export function FAQ(props: { compact?: boolean }) {
  return (
    <div class="site-faq">
      <For each={props.compact ? questions.slice(0, 6) : questions}>
        {(item) => (
          <details>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
            <a class="site-inline-link" href={item.href}>
              {item.action} <ArrowRight size={15} />
            </a>
          </details>
        )}
      </For>
    </div>
  );
}

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
    body: 'An authorized administrator approves the source and checks indexing status. A submitted file alone is not a published source, and a new version should not quietly inherit trust.',
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
              aria-pressed={stage() === index()}
              aria-controls="workflow-preview"
              onClick={() => setStage(index())}
            >
              <span aria-hidden="true">0{index() + 1}</span>
              {item.label}
              <ArrowRight size={18} />
            </button>
          )}
        </For>
      </div>
      <div id="workflow-preview" class="site-process-preview" aria-live="polite">
        <Show when={stages[stage()]} keyed>
          {(item) => (
            <div class="site-fade">
              <span class="site-label">{item.label}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <p class="site-process-detail">{item.detail}</p>
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
      title: 'Handbooks & regulations',
      detail: 'Find a rule in context, with its section and version.',
    },
    {
      icon: Library,
      title: 'Course information',
      detail: 'Connect a course question to the document that describes it.',
    },
    {
      icon: FileText,
      title: 'Forms & procedures',
      detail: 'Locate the relevant form and read the steps around it.',
    },
    {
      icon: ListChecks,
      title: 'FAQs & guidance',
      detail: 'Return to the original explanation when an answer needs context.',
    },
  ];
  return (
    <div class="site-document-rows">
      <For each={rows}>
        {(item) => (
          <div class="fx-card">
            <item.icon size={23} />
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
      <div>
        <span class="site-label">Your next question</span>
        <h2>Start with what you need to know.</h2>
      </div>
      <div class="site-actions">
        <a class="primary fx-magnet" href="#/">
          Ask a question <ArrowRight size={18} />
        </a>
        <a href="#/contact">
          Discuss an institutional pilot <ArrowRight size={17} />
        </a>
      </div>
    </Band>
  );
}

export function HomeSections(props: { motion: boolean; institution: string }) {
  return (
    <div class="site-content">
      <Band motion={props.motion} class="site-example-band">
        <div class="site-section-heading">
          <div>
            <span class="section-number">Answer & evidence</span>
            <h2>
              An answer is a beginning.
              <br />
              The source takes you further.
            </h2>
          </div>
          <p>Read the passage, check the version and decide what the evidence actually supports.</p>
        </div>
        <ProductExample />
      </Band>
      <Story motion={props.motion} />
      <Marquee />
      <Band motion={props.motion}>
        <div class="site-section-heading">
          <div>
            <span class="site-label">The collection</span>
            <h2>
              Less searching.
              <br />
              More understanding.
            </h2>
          </div>
          <p>
            Built for the documents university life runs on, from handbooks to the forms you
            need this week.
          </p>
        </div>
        <DocumentRows />
        <div class="site-collection-note">
          <a class="site-inline-link" href="#/sources">
            Explore sources <ArrowRight size={18} />
          </a>
        </div>
        <CollectionPreview institution={props.institution} />
      </Band>
      <Band motion={props.motion} class="site-audiences">
        <div>
          <Languages size={25} />
          <span class="site-label">For students</span>
          <h2>
            Your question.
            <br />
            Your next step.
          </h2>
          <p>
            Ask in English or Vietnamese, inspect the passage behind the answer and carry a clearer
            question to the right office.
          </p>
          <a class="site-inline-link" href="#/students">
            Explore the student experience <ArrowRight size={18} />
          </a>
        </div>
        <div>
          <Library size={25} />
          <span class="site-label">For universities</span>
          <h2>
            Reconnect with
            <br />
            your students.
          </h2>
          <p>
            Give institutional knowledge a path from reviewed documents to the questions students
            are asking.
          </p>
          <a class="site-inline-link" href="#/universities">
            Explore the institutional pilot <ArrowRight size={18} />
          </a>
        </div>
      </Band>
      <Band motion={props.motion}>
        <div class="site-section-heading">
          <div>
            <span class="site-label">A considered collection</span>
            <h2>
              Useful answers start
              <br />
              before the question.
            </h2>
          </div>
          <p>Source ownership and human review stay part of the process. Explore each stage.</p>
        </div>
        <Workflow />
      </Band>
      <Kinetic motion={props.motion} />
      <Band motion={props.motion} class="site-trust-band">
        <h2>
          Know what an answer
          <br />
          can—and cannot—tell you.
        </h2>
        <div class="site-trust-rows">
          <div class="fx-card">
            <h3>Trace a claim</h3>
            <p>Open its source passage, document version and page or section locator.</p>
          </div>
          <div class="fx-card">
            <h3>Keep the limits visible</h3>
            <p>
              Missing or conflicting evidence needs a clear limitation. An unavailable service must
              not become a made-up answer.
            </p>
          </div>
          <div class="fx-card">
            <h3>Stay within your access</h3>
            <p>
              Source visibility follows your institution and account. Feedback gives you a way to
              flag a questionable claim.
            </p>
          </div>
          <a class="site-inline-link" href="#/security">
            Read about trust and security <ArrowRight size={17} />
          </a>
        </div>
      </Band>
      <Band motion={props.motion} class="site-pilot-band">
        <span class="site-label">Current pilot</span>
        <h2>
          Small enough to learn.
          <br />
          Careful enough to question.
        </h2>
        <p>
          noti.school is starting with HCMIU students, in English and Vietnamese. Access is by
          invitation while the collection grows.
        </p>
        <div class="site-actions">
          <a class="site-inline-link" href="#/pricing">
            Pilot access & pricing <ArrowRight size={18} />
          </a>
          <a class="site-inline-link" href="#/contact">
            Get in touch <ArrowRight size={18} />
          </a>
        </div>
      </Band>
      <Band motion={props.motion} class="site-faq-band">
        <div>
          <span class="site-label">Before you ask</span>
          <h2>A few useful answers.</h2>
          <a class="site-inline-link" href="#/help">
            Visit Help <ArrowRight size={17} />
          </a>
        </div>
        <FAQ compact />
      </Band>
      <Closing motion={props.motion} />
    </div>
  );
}
