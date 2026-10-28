// intent: shared FAQ content for the landing filter and the Help page; written for any university, HCMIU only as the pilot.
// status: done
// next: keep answers truthful; never add regulations, deadlines, offices or partners.
// confidence: high

export type FaqCategory = 'Answers' | 'Sources' | 'Accounts' | 'Pilot';

export interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  href: string;
  action: string;
  /** Shown in the landing FAQ as well as on the Help page. */
  landing: boolean;
}

export const faqCategories: readonly FaqCategory[] = ['Answers', 'Sources', 'Accounts', 'Pilot'];

export const questions: readonly FaqItem[] = [
  {
    id: 'universities',
    category: 'Pilot',
    question: 'Which universities can use noti.school?',
    answer:
      "Any university can request access. HCMIU is the first pilot. Each school is set up separately: its source team approves documents before students can ask about them.",
    href: '#join',
    action: 'Request your university',
    landing: true,
  },
  {
    id: 'other-university',
    category: 'Sources',
    question: "Can I see another university's documents?",
    answer:
      "No. Your account belongs to one school, and answers only use that school's approved documents. Documents, questions and feedback stay inside each university.",
    href: '#scope',
    action: 'How schools are kept apart',
    landing: true,
  },
  {
    id: 'vietnamese',
    category: 'Answers',
    question: 'Can I ask in Vietnamese?',
    answer:
      'Yes. Choose Tiếng Việt in the question box. English is also available. Bilingual answer quality still needs evaluation against approved sources.',
    href: '#/',
    action: 'Go to the question box',
    landing: true,
  },
  {
    id: 'coverage',
    category: 'Sources',
    question: "Does it have all of my university's documents?",
    answer:
      "Not necessarily. Coverage depends on what your school has approved and what your account can see. Check the source library and each document's edition before relying on an answer.",
    href: '#/sources',
    action: 'Check source availability',
    landing: true,
  },
  {
    id: 'no-answer',
    category: 'Answers',
    question: 'What if there is no supported answer?',
    answer:
      'Keep your question specific and check the source library. Missing, conflicting or unavailable evidence produces a limitation, not a guessed rule. Contact the relevant university office for a decision.',
    href: '#/sources',
    action: 'Look for a source',
    landing: true,
  },
  {
    id: 'join',
    category: 'Accounts',
    question: 'How do I get access?',
    answer:
      "Access is invitation-bound and tied to your school. Sign in if you already have an invitation. If your university isn't set up yet, request it. Availability of Google sign-in and email recovery depends on configuration.",
    href: '#/auth',
    action: 'Open your account',
    landing: false,
  },
  {
    id: 'report',
    category: 'Sources',
    question: 'Can I report an incorrect answer?',
    answer:
      'Use the feedback action on an answer. Identify the claim and the relevant source passage. Avoid including student IDs, personal records or other sensitive information in a report.',
    href: '#/history',
    action: 'Find a previous answer',
    landing: true,
  },
  {
    id: 'official',
    category: 'Pilot',
    question: 'Is this an official university service?',
    answer:
      'No. noti.school is an independent project in development and claims no official affiliation with any university. Its answers help you find and inspect information; the original source and responsible office remain the places to confirm an important decision.',
    href: '#/about',
    action: 'About the project',
    landing: true,
  },
  {
    id: 'sign-in',
    category: 'Accounts',
    question: 'Why can’t I sign in or reset my password?',
    answer:
      'Read the availability message on the account page. If email or sign-in is unavailable, repeating the request will not enable it. Keep your question draft in this tab and contact the owner for access help.',
    href: '#/contact',
    action: 'Get access help',
    landing: false,
  },
  {
    id: 'stopped',
    category: 'Answers',
    question: 'Why did my answer stop or become unavailable?',
    answer:
      'An interrupted request may still be processing. Follow the message in the answer workspace; submitting the same question can check the same operation. Do not assume a stopped request means the server cancelled it.',
    href: '#/answer',
    action: 'Return to the answer workspace',
    landing: false,
  },
  {
    id: 'open-source',
    category: 'Sources',
    question: 'Why can’t I open a source?',
    answer:
      'The document may belong to a different university or be restricted to another account, or a version may no longer be current. Sign in with the right account and check the library. A citation does not grant access to a restricted document.',
    href: '#/sources',
    action: 'Open the source library',
    landing: false,
  },
  {
    id: 'contribute',
    category: 'Pilot',
    question: 'Can my university contribute documents?',
    answer:
      "Start by requesting your university and agreeing who owns and approves each source. A proposed document is not answer evidence until your school's source team has reviewed and published it.",
    href: '#/universities',
    action: 'How universities take part',
    landing: false,
  },
];
