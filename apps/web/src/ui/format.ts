export type Lang = 'en' | 'vi';

// Day-month-year everywhere: the pilot audience reads DD/MM, and a written month avoids ambiguity.
export function formatDate(value: string | Date, lang: Lang = 'en') {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** "Today", "Yesterday", "3 days ago", then a written date after a week. */
export function relativeDate(value: string, lang: Lang = 'en', now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);
  if (days < 0 || days >= 7) return formatDate(date, lang);
  const rtf = new Intl.RelativeTimeFormat(lang === 'vi' ? 'vi' : 'en', { numeric: 'auto' });
  const text = rtf.format(-days, 'day');
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
