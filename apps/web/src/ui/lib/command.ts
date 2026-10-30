// intent: command-menu filtering, grouping and Enter resolution as pure functions for testability.
// status: done
// next: CommandMenu.tsx renders these; add fields to CommandItem only when a consumer needs them.
// confidence: high
import type { LucideIcon } from 'lucide-solid';
import { matchesQuery } from './text';

export interface CommandItem {
  /** Stable id, used for DOM ids and keys. */
  id: string;
  /** Visible label; also searched. */
  label: string;
  /** Group heading, items render in first-seen group order. */
  group: string;
  /** Extra search terms that are not shown. */
  keywords?: readonly string[];
  /** Optional shortcut hint shown as a Kbd, e.g. "/". */
  shortcut?: string;
  /** Optional lucide-solid icon component. */
  icon?: LucideIcon;
  /** Runs after the menu closes. */
  run: () => void;
}

export interface CommandGroup<T extends CommandItem = CommandItem> {
  group: string;
  items: T[];
}

/** Items whose label or keywords match the query, ignoring case and Vietnamese diacritics. */
export function filterCommands<T extends CommandItem>(items: readonly T[], query: string): T[] {
  return items.filter(item => matchesQuery(query, item.label, ...(item.keywords ?? [])));
}

/** Groups items preserving first-seen group order and item order. */
export function groupCommands<T extends CommandItem>(items: readonly T[]): CommandGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(item.group);
    if (bucket) bucket.push(item);
    else groups.set(item.group, [item]);
  }
  return [...groups].map(([group, grouped]) => ({ group, items: grouped }));
}

/** Moves the active index with wrap-around; returns 0 for an empty list. */
export function moveActive(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

export type CommandEnter<T extends CommandItem> = { kind: 'run'; item: T } | { kind: 'fallback'; text: string } | { kind: 'none' };

/** Enter runs the active match; with no match, non-blank text becomes a fallback (asked as a question). */
export function resolveCommandEnter<T extends CommandItem>(shown: readonly T[], active: number, query: string): CommandEnter<T> {
  const item = shown[active];
  if (item) return { kind: 'run', item };
  const text = query.trim();
  return text ? { kind: 'fallback', text } : { kind: 'none' };
}

/** Id of the synthetic "Ask …" row that stands in for an empty result list. */
export const ASK_COMMAND_ID = 'ask-typed-question';

/**
 * Matches for the query; when nothing matches non-blank text, a single selectable "Ask" row that runs `ask` with the
 * trimmed text, so asking is an option the reader can see and pick, not an instruction to press Enter.
 */
export function commandsWithAsk(items: readonly CommandItem[], query: string, ask: (text: string) => void, icon?: LucideIcon): CommandItem[] {
  const shown = filterCommands(items, query);
  const text = query.trim();
  if (shown.length || !text) return shown;
  return [{ id: ASK_COMMAND_ID, group: 'Ask', label: `Ask “${text}”`, ...(icon ? { icon } : {}), run: () => ask(text) }];
}
