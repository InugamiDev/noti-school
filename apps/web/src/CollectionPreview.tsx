import { For, Show } from 'solid-js';
import type { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { SkeletonList } from './ui/Loader';
import { createRemoteResource, accessScope } from './resource';
import { get, endpoint } from './api';
import { formatDate } from './ui/format';
import { BookOpen, ChevronRight } from 'lucide-solid';
import './ui/sources.css';

export type SourceItem = z.infer<typeof Schemas.Source>;
export type VersionItem = z.infer<typeof Schemas.Version>;

export const formatLabel = (kind: SourceItem['kind']) =>
  kind === 'pdf' ? 'PDF' : kind === 'url' ? 'Web page' : 'Text';

const isPast = (value: string | null) => !!value && Date.parse(value) < Date.now();
const isFuture = (value: string | null) => !!value && Date.parse(value) > Date.now();

/** Plain-language validity of a version, or '' when the version carries no dates. */
export function effectText(v: VersionItem) {
  if (isPast(v.effective_until)) return `Ended ${formatDate(v.effective_until!)}`;
  if (isFuture(v.effective_from)) return `In effect from ${formatDate(v.effective_from!)}`;
  if (v.effective_from) return `In effect since ${formatDate(v.effective_from)}`;
  return '';
}

/** One row of the collection: title, current edition, validity and format. */
export function SourceRow(props: { source: SourceItem; index?: number }) {
  // One request per visible row, bounded by the page size the list was fetched with.
  const [current] = createRemoteResource(
    () =>
      props.source.current_version_id
        ? { institution: props.source.institution_id, version: props.source.current_version_id }
        : false,
    (key) =>
      get(
        endpoint('/api/v1/institutions/{institution_id}/versions/{version_id}', {
          institution_id: key.institution,
          version_id: key.version,
        }),
        'Version',
      ),
  );
  return (
    <a
      href={`#/sources/${props.source.id}`}
      class="list-row source-row"
      classList={{ 'stagger-in': props.index !== undefined }}
      style={props.index !== undefined ? { '--i': props.index } : undefined}
    >
      <BookOpen size={20} />
      <span class="source-row-text">
        <span class="source-row-title">{props.source.title}</span>
        <small class="source-row-meta">
          <Show
            when={props.source.current_version_id}
            fallback={<span>No current edition published yet</span>}
          >
            <Show
              when={current()}
              fallback={
                <Show when={current.loading}>
                  <span class="source-row-pending">Checking edition…</span>
                </Show>
              }
            >
              {(v) => (
                <>
                  <span>{v().label}</span>
                  <Show when={effectText(v())}>{(text) => <span>{text()}</span>}</Show>
                </>
              )}
            </Show>
          </Show>
          <span class="format-tag">{formatLabel(props.source.kind)}</span>
        </small>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </a>
  );
}

export default function CollectionPreview(props: { institution: string }) {
  const [data] = createRemoteResource(
    () => props.institution || false,
    (id) =>
      get(
        endpoint('/api/v1/institutions/{institution_id}/sources', { institution_id: id }) +
          '?limit=3',
        'SourcePage',
      ),
  );
  return (
    <div class="collection-rows">
      <Show when={data.loading || (accessScope() === 'initial' && !!props.institution)}>
        <SkeletonList rows={3} label="Loading collection" />
      </Show>
      <Show when={data.error || !props.institution}>
        <p class="muted">Sign in to check the sources available to your account.</p>
      </Show>
      <For each={data()?.items}>{(s, i) => <SourceRow source={s} index={i()} />}</For>
      <Show when={data() && !data()?.items.length}>
        <p class="muted">No documents are available to your account yet.</p>
      </Show>
    </div>
  );
}
