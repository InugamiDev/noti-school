// intent: pure presentation rules for the signed-in workspace (answer status, unavailable errors, locators, source and
//         version badges, source filter) kept out of TSX so they stay unit-testable.
// status: done
// next: if the API adds a supersession field, read it here instead of inferring "superseded" from current_version_id.
// confidence: high
import type { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { matchesQuery } from '../ui/lib/text';

type Answer = z.infer<typeof Schemas.Answer>;
type Evidence = z.infer<typeof Schemas.Evidence>;
type Locator = z.infer<typeof Schemas.Locator>;
type Source = z.infer<typeof Schemas.Source>;
type Version = z.infer<typeof Schemas.Version>;

export type Tone = 'neutral' | 'sage' | 'clay' | 'danger';

export interface AnswerPresentation {
  /** Visible status label; never claims verification. */
  label: string;
  tone: Tone;
  /** AnswerCard state: abstained answers use the designed no-answer state. */
  card: 'answer' | 'no-answer';
}

const ANSWER_PRESENTATION: Record<Answer['status'], AnswerPresentation> = {
  answered: { label: 'Answer with sources', tone: 'sage', card: 'answer' },
  qualified: { label: 'Answer with limitations', tone: 'clay', card: 'answer' },
  abstained: { label: 'Not enough evidence', tone: 'neutral', card: 'no-answer' },
};

/** How an answer status is shown; supported, qualified and abstained answers stay visually distinct. */
export function answerPresentation(status: Answer['status']): AnswerPresentation {
  return ANSWER_PRESENTATION[status];
}

// Error codes that mean the selected answer provider or core service cannot answer now (never a guessed fallback).
const UNAVAILABLE_CODES = new Set(['provider_unavailable', 'budget_exhausted', 'pricing_unavailable', 'core_unavailable']);

/** True when an ask failure is a service outage, shown as the AnswerCard unavailable state rather than a form error. */
export function isUnavailableCode(code: string | undefined): boolean {
  return code !== undefined && UNAVAILABLE_CODES.has(code);
}

/** True when an ask failure needs the reader to sign in or switch account. */
export function isAccessCode(code: string | undefined): boolean {
  return code === 'unauthenticated' || code === 'forbidden';
}

/** Page and section of a locator, e.g. "Page 2 · Section 4.2"; either part may be missing. */
export function locatorText(locator: Locator): string {
  const parts = [locator.page ? `Page ${locator.page}` : '', locator.section ?? ''].filter(Boolean);
  return parts.join(' · ');
}

/** Locator line for a cited passage: document, version and page/section. */
export function evidenceLocator(evidence: Evidence): string {
  return [evidence.title, evidence.version_label, locatorText(evidence.locator)].filter(Boolean).join(' · ');
}

/** Plain-text citation copied to the clipboard. */
export function citationText(evidence: Evidence): string {
  return [evidence.title, evidence.version_label, locatorText(evidence.locator)].filter(Boolean).join(', ');
}

/** 1-based number of an evidence id within the answer, matching the citation chips. */
export function citationIndex(answer: Answer, evidenceId: string): number {
  return answer.evidence.findIndex(e => e.id === evidenceId) + 1;
}

export interface BadgeView {
  label: string;
  tone: Tone;
}

const expired = (until: string | null, now: number) => until !== null && Date.parse(until) < now;

/**
 * Status badge for a document version. Approved versions that are no longer the source's current version are
 * superseded; versions still being checked are under review. Nothing here implies the content is verified.
 */
export function versionBadge(version: Version, currentVersionId: string | null | undefined, now = Date.now()): BadgeView {
  switch (version.status) {
    case 'approved':
      if (currentVersionId && currentVersionId !== version.id) return { label: 'Superseded', tone: 'neutral' };
      if (expired(version.effective_until, now)) return { label: 'Approved, expired', tone: 'neutral' };
      return { label: 'Approved', tone: 'sage' };
    case 'archived':
      return { label: 'Archived', tone: 'neutral' };
    case 'failed':
      return { label: 'Failed', tone: 'danger' };
    case 'draft':
      return { label: 'Draft', tone: 'neutral' };
    default:
      return { label: 'Under review', tone: 'clay' };
  }
}

/** Indexing state in plain words. */
export function indexingText(indexing: Version['indexing']): string {
  const labels: Record<Version['indexing'], string> = {
    pending: 'Indexing pending',
    running: 'Indexing in progress',
    ready: 'Indexed',
    failed: 'Indexing failed',
    disabled: 'Indexing disabled',
  };
  return labels[indexing];
}

/** Badge for a source in the library list. */
export function sourceBadge(source: Source): BadgeView {
  return source.current_version_id
    ? { label: 'Current version', tone: 'sage' }
    : { label: 'Awaiting a current version', tone: 'clay' };
}

/** Readable document kind. */
export function kindText(kind: Source['kind']): string {
  return kind === 'url' ? 'Web page' : kind.toUpperCase();
}

/** Effective dates in words, without dash ranges. */
export function effectiveText(from: string | null, until: string | null, format: (iso: string) => string): string {
  const start = from ? `Effective from ${format(from)}` : 'Effective date not specified';
  const end = until ? `until ${format(until)}` : 'no end date supplied';
  return `${start}, ${end}.`;
}

/** Sources whose title or kind matches the filter, ignoring case and Vietnamese diacritics. */
export function filterSources<T extends Pick<Source, 'title' | 'kind'>>(items: readonly T[], query: string): T[] {
  return items.filter(item => matchesQuery(query, item.title, kindText(item.kind)));
}
