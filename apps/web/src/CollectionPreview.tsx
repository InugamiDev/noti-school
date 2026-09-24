import { For, Show } from 'solid-js';
import { createRemoteResource } from './resource';
import { get, endpoint } from './api';
import { BookOpen, ArrowUpRight } from 'lucide-solid';
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
      <Show when={data.loading}>
        <div class="skeleton" role="status" aria-label="Loading collection" />
      </Show>
      <Show when={data.error || !props.institution}>
        <p class="muted">Sign in to check the sources available to your account.</p>
      </Show>
      <For each={data()?.items}>
        {(s) => (
          <a href={`#/sources/${s.id}`} class="list-row">
            <BookOpen size={20} />
            <span>
              {s.title}
              <small>
                {s.kind.toUpperCase()} ·{' '}
                {s.current_version_id ? 'Version available' : 'Awaiting a current version'}
              </small>
            </span>
            <ArrowUpRight size={18} />
          </a>
        )}
      </For>
      <Show when={data() && !data()?.items.length}>
        <p class="muted">No documents are available to your account yet.</p>
      </Show>
    </div>
  );
}
