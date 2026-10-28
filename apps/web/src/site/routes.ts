// intent: one place for public site routes, landing section anchors and hash parsing, kept pure for unit tests.
// status: done
// next: add a landing section here before linking to it; links to unknown anchors would otherwise route to "not found".
// confidence: high

export const sitePages = {
  '/': [
    'University answers you can check',
    "Ask about your university's rules in English or Vietnamese. Answers use only your school's approved documents and show the page they came from.",
  ],
  '/product': [
    'Product',
    'Follow a question from answer to source passage, document version and feedback.',
  ],
  '/students': [
    'For students',
    'Find university information, check its source and know when to ask for help.',
  ],
  '/universities': [
    'For universities',
    'How a university approves its own sources, keeps documents current and learns from student feedback.',
  ],
  '/pricing': [
    'Pricing and pilot access',
    'Pilot access is limited. Public pricing and paid plans have not been announced.',
  ],
  '/about': [
    'About noti.school',
    'An independent project making university information easier to find and inspect.',
  ],
  '/help': [
    'Help',
    'Practical help with questions, sources, account access and unavailable answers.',
  ],
  '/contact': [
    'Contact',
    'Contact the project owner about access for your university, source issues or product questions.',
  ],
  '/security': [
    'Security',
    'Understand source approval, account boundaries and current verification limits.',
  ],
  '/privacy': [
    'Pilot privacy notice',
    'Read the draft notice on account data, questions, source passages and external processing.',
  ],
  '/terms': [
    'Pilot terms draft',
    'Understand the limits of an independent university information assistant.',
  ],
  '/changelog': [
    'Changelog',
    'What is included in the current pilot and what remains under evaluation.',
  ],
} as const;

export type SiteRoute = keyof typeof sitePages;
export function isSiteRoute(route: string): route is SiteRoute {
  return Object.hasOwn(sitePages, route);
}

/** In-page anchors on the landing; `#how` style links open the landing and scroll to the section. */
export const landingSections = {
  scope: 'Every school gets its own sources',
  how: 'How an answer gets made',
  roles: 'Built for everyone at a university',
  reads: 'What it reads',
  join: 'Bring noti.school to your university',
  faq: 'Questions',
} as const;

export type LandingSection = keyof typeof landingSections;
export function isLandingSection(value: string): value is LandingSection {
  return Object.hasOwn(landingSections, value);
}

export interface HashLocation {
  /** Application route, always starting with "/". */
  route: string;
  /** Landing section to scroll to, or '' when the hash is a route. */
  section: LandingSection | '';
}

/** Maps `location.hash` to a route: `#/x` is a route, `#how` is a landing section, anything else is home. */
export function parseHash(hash: string): HashLocation {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (isLandingSection(value)) return { route: '/', section: value };
  if (!value || !value.startsWith('/')) return { route: '/', section: '' };
  return { route: value, section: '' };
}
