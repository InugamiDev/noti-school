import { Show } from 'solid-js';
import { FileCheck, Globe } from 'lucide-solid';
import { t } from './i18n';
import { formatDate, type Lang } from './format';
import './confidence.css';

/** Where an evidence item came from. A web page names its domain and is never worded as approved. */
export function OriginTag(props: { origin: 'approved' | 'web'; domain: string | null; lang?: Lang | undefined }) {
  return (
    <span class="origin-tag" data-origin={props.origin}>
      <Show when={props.origin === 'web'} fallback={<FileCheck size={14} aria-hidden="true" />}>
        <Globe size={14} aria-hidden="true" />
      </Show>
      {t(props.lang, props.origin === 'web' ? 'originWeb' : 'originApproved')}
      <Show when={props.origin === 'web' && props.domain}>
        {' · '}
        <span class="origin-domain">{props.domain}</span>
      </Show>
    </span>
  );
}

/** "Fetched 3 Nov 2026" for web items; approved documents carry their edition instead. */
export function FetchedDate(props: { at: string | null; lang?: Lang | undefined }) {
  return (
    <Show when={props.at && formatDate(props.at, props.lang)}>
      {(date) => (
        <span class="fetched-date">
          {t(props.lang, 'fetched')} {date()}
        </span>
      )}
    </Show>
  );
}
