import { createSignal, For, Show } from 'solid-js';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  FileText,
  Languages,
  Library,
  ListChecks,
} from 'lucide-solid';
import { Band } from './Band';
import ProductExample from './ProductExample';
import CollectionPreview from '../CollectionPreview';

export const questions = [
  {
    category: 'Answers',
    question: 'Can I ask in Vietnamese?',
    answer:
      'Yes. Choose Tiếng Việt in the question composer. English is also available. Bilingual answer quality still needs evaluation against approved sources.',
    href: '#/',
    action: 'Go to the question composer',
  },
  {
    category: 'Sources',
    question: 'Does noti.school have all HCMIU documents?',
    answer:
      'No coverage is promised. The pilot targets HCMIU, but access depends on the approved documents available to your account. Check the source library and each document’s version before relying on an answer.',
    href: '#/sources',
    action: 'Check source availability',
  },
  {
    category: 'Answers',
    question: 'What if there is no supported answer?',
    answer:
      'Keep your question specific and check the source library. Missing, conflicting or unavailable evidence should produce a limitation, not a guessed rule. Contact the relevant university office for a decision.',
    href: '#/sources',
    action: 'Look for a source',
  },
  {
    category: 'Accounts',
    question: 'How do I join the pilot?',
    answer:
      'Access is invitation-bound. Sign in if you already have access, or contact the project owner to discuss participation. Availability of Google sign-in and email recovery depends on configuration.',
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
      'No official affiliation is claimed. noti.school is an independent project in development. Its answers help you find and inspect information; the original source and responsible office remain the places to confirm an important decision.',
    href: '#/about',
    action: 'About the project',
  },
  {
    category: 'Accounts',
    question: 'Why can’t I sign in or reset my password?',
    answer:
      'Read the availability message on the account page. If email or sign-in is unavailable, repeating the request will not enable it. Keep your question draft in this tab and contact the owner for access help.',
    href: '#/contact',
    action: 'Get access help',
  },
  {
    category: 'Answers',
    question: 'Why did my answer stop or become unavailable?',
    answer:
      'An interrupted request may still be processing. Follow the message in the answer workspace; submitting the same question can check the same operation. Do not assume a stopped request means the server cancelled it.',
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
              {item.action} <ArrowUpRight size={15} />
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
          <div>
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
        <a class="primary" href="#/">
          Ask a question <ArrowUpRight size={18} />
        </a>
        <a href="#/contact">
          Discuss an institutional pilot <ArrowUpRight size={17} />
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
            Designed for the documents university life runs on. Availability depends on reviewed
            sources, not the size of the promise.
          </p>
        </div>
        <DocumentRows />
        <div class="site-collection-note">
          <p>These are supported information categories, not a claim of current HCMIU coverage.</p>
          <a class="site-inline-link" href="#/sources">
            Explore sources <ArrowUpRight size={18} />
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
            Explore the student experience <ArrowUpRight size={18} />
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
            Explore the institutional pilot <ArrowUpRight size={18} />
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
      <Band motion={props.motion} class="site-trust-band">
        <h2>
          Know what an answer
          <br />
          can—and cannot—tell you.
        </h2>
        <div class="site-trust-rows">
          <div>
            <h3>Trace a claim</h3>
            <p>Open its source passage, document version and page or section locator.</p>
          </div>
          <div>
            <h3>Keep the limits visible</h3>
            <p>
              Missing or conflicting evidence needs a clear limitation. An unavailable service must
              not become a made-up answer.
            </p>
          </div>
          <div>
            <h3>Stay within your access</h3>
            <p>
              Source visibility follows your institution and account. Feedback gives you a way to
              flag a questionable claim.
            </p>
          </div>
          <a class="site-inline-link" href="#/security">
            Read about trust and security <ArrowUpRight size={17} />
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
          HCMIU is the initial focus. Approved source coverage and real-world answer quality are
          still being established. Access is limited; public prices have not been set.
        </p>
        <div class="site-actions">
          <a class="site-inline-link" href="#/pricing">
            Pilot access & pricing <ArrowUpRight size={18} />
          </a>
          <a class="site-inline-link" href="#/contact">
            Talk to the project owner <ArrowUpRight size={18} />
          </a>
        </div>
      </Band>
      <Band motion={props.motion} class="site-faq-band">
        <div>
          <span class="site-label">Before you ask</span>
          <h2>A few useful answers.</h2>
          <a class="site-inline-link" href="#/help">
            Visit Help <ArrowUpRight size={17} />
          </a>
        </div>
        <FAQ compact />
      </Band>
      <Closing motion={props.motion} />
    </div>
  );
}
