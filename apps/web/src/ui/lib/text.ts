// intent: diacritic-insensitive matching so "han rut mon" finds "Hạn rút môn" in FAQ and command filters.
// status: done
// next: reuse matchesQuery for any client-side filter instead of ad hoc toLowerCase().includes().
// confidence: high

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Strips Vietnamese (and other Latin) diacritics, maps đ/Đ to d, lowercases and collapses whitespace. */
export function normalizeVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every whitespace-separated term of `query` occurs in one of `fields`, ignoring case and diacritics. */
export function matchesQuery(query: string, ...fields: readonly string[]): boolean {
  const terms = normalizeVi(query).split(' ').filter(Boolean);
  if (!terms.length) return true;
  const haystack = normalizeVi(fields.join(' '));
  return terms.every(term => haystack.includes(term));
}
