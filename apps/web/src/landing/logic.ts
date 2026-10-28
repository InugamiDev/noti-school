// intent: pure landing logic (school list from real API data, hero label, request form validation) kept out of TSX for unit tests.
// status: done
// next: if the API gains a public school directory, feed it through schoolOptions instead of adding names here.
// confidence: high
import type { School } from '../ui';

export interface InstitutionLike {
  id: string;
  slug: string;
  name: string;
  coverage: 'none' | 'synthetic_demo' | 'approved_sources';
}

export interface MembershipLike {
  institution_id: string;
}

const COVERAGE_TEXT: Record<InstitutionLike['coverage'], string> = {
  approved_sources: 'Approved sources available',
  synthetic_demo: 'Demo collection, synthetic examples only',
  none: 'Pilot collection, coverage not yet confirmed',
};

/** Plain-language coverage line for an institution, as shown under the composer and in the picker. */
export function coverageText(coverage: InstitutionLike['coverage'] | undefined): string {
  return coverage ? COVERAGE_TEXT[coverage] : 'School list unavailable right now';
}

/**
 * Schools the picker may offer. Signed-in visitors only see the schools their account belongs to;
 * everyone else sees the institutions the API lists (the pilot). Nothing is invented.
 */
export function schoolOptions(
  institutions: readonly InstitutionLike[],
  memberships: readonly MembershipLike[] | undefined,
): School[] {
  const member = new Set(memberships?.map(m => m.institution_id) ?? []);
  const own = institutions.filter(i => member.has(i.id));
  const visible = own.length ? own : institutions;
  return visible.map(i => ({
    id: i.id,
    name: i.name,
    subtitle: coverageText(i.coverage),
    status: i.coverage === 'synthetic_demo' ? 'demo' : 'pilot',
  }));
}

/** The institution a signed-in account should ask about: the current one if it is a membership, else the first membership. */
export function membershipInstitution(
  current: string,
  institutions: readonly InstitutionLike[],
  memberships: readonly MembershipLike[] | undefined,
): string | undefined {
  if (!memberships?.length) return undefined;
  if (memberships.some(m => m.institution_id === current)) return current;
  return memberships.find(m => institutions.some(i => i.id === m.institution_id))?.institution_id;
}

const HERO_LABEL_MAX = 14;

/** Short label for the 3D bookstack: the name when it fits, else the slug in capitals, else a truncated name. */
export function heroLabel(name: string | undefined, slug: string | undefined): string {
  const clean = name?.trim() ?? '';
  if (clean && clean.length <= HERO_LABEL_MAX) return clean;
  const short = slug?.trim().toUpperCase() ?? '';
  if (short && short.length <= HERO_LABEL_MAX) return short;
  if (clean) return `${clean.slice(0, HERO_LABEL_MAX - 1).trimEnd()}…`;
  return 'Your school';
}

export const requestRoles = ['Student', 'Advisor or staff', 'Source or IT team', 'University leadership'] as const;
export type RequestRole = (typeof requestRoles)[number];

export interface RequestDraft {
  university: string;
  role: RequestRole;
  email: string;
}

export interface RequestErrors {
  university?: string;
  email?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Inline validation for the request form; an empty object means the draft is valid. */
export function validateRequest(draft: RequestDraft): RequestErrors {
  const errors: RequestErrors = {};
  if (draft.university.trim().length < 2) errors.university = "Enter your university's name.";
  if (!EMAIL.test(draft.email.trim())) errors.email = 'Enter a valid email address.';
  return errors;
}

export const sampleQuestions = ['How do I register for courses?', 'Khi nào hạn rút môn học?'] as const;
