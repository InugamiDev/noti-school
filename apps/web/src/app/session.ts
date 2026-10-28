// intent: explicit tri-states for identity and the institution list, so loading never renders as signed out or unavailable.
// status: done
// next: App derives both with createMemo, passing the previous value so a background refetch keeps the resolved state.
// confidence: high; unit-tested in tests/app-session.test.ts

export type SessionState = 'loading' | 'signed-in' | 'signed-out';
export type InstitutionsState = 'loading' | 'ready' | 'unavailable';

interface ResourceSnapshot {
  /** The resource is fetching (first load or refetch). */
  loading: boolean;
  /** A value is present (an identity, or at least one institution). */
  present: boolean;
}

/** Identity: an identity is signed in; a settled read without one (empty or error) is signed out; otherwise keep waiting. */
export function deriveSession(me: ResourceSnapshot, previous: SessionState = 'loading'): SessionState {
  if (me.present) return 'signed-in';
  if (!me.loading) return 'signed-out';
  // A background refetch keeps the last settled answer instead of dropping back to unknown.
  return previous;
}

/** Institutions: ready with at least one school, unavailable once a settled read has none or failed. */
export function deriveInstitutions(list: ResourceSnapshot, previous: InstitutionsState = 'loading'): InstitutionsState {
  if (list.present) return 'ready';
  if (!list.loading) return 'unavailable';
  return previous;
}
