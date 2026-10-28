// intent: web storage that never throws (private mode, disabled cookies, quota, non-browser runtimes).
// status: done
// next: callers namespace their own keys; values are strings only, serialise before set().
// confidence: high

export interface SafeStorage {
  /** Returns the stored string, or null when missing or storage is unavailable. */
  get(key: string): string | null;
  /** Stores the value; returns false when storage is unavailable or full. */
  set(key: string, value: string): boolean;
  /** Removes the key; returns false when storage is unavailable. */
  remove(key: string): boolean;
}

const PREFIX = 'noti.';

/** Wraps a storage resolver; the resolver itself may throw (e.g. a SecurityError on property access). */
export function createSafeStorage(resolve: () => Storage | undefined, prefix = PREFIX): SafeStorage {
  const store = (): Storage | undefined => {
    try {
      return resolve();
    } catch {
      return undefined;
    }
  };
  return {
    get(key) {
      try {
        return store()?.getItem(prefix + key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      const target = store();
      if (!target) return false;
      try {
        target.setItem(prefix + key, value);
        return true;
      } catch {
        return false;
      }
    },
    remove(key) {
      const target = store();
      if (!target) return false;
      try {
        target.removeItem(prefix + key);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Browser localStorage (persists across sessions), tolerant of unavailability. */
export const localStore: SafeStorage = createSafeStorage(() => globalThis.localStorage);
/** Browser sessionStorage (this tab only, e.g. drafts that must survive auth), tolerant of unavailability. */
export const sessionStore: SafeStorage = createSafeStorage(() => globalThis.sessionStorage);
