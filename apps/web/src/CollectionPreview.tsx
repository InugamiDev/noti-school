import { For, Show } from 'solid-js';
import { createRemoteResource } from './resource';
import { get, endpoint } from './api';
import { BookOpen } from 'lucide-solid';
import { Badge, Skeleton } from './ui';
import { kindText, sourceBadge } from './app/workspace';
import page from './app/Page.module.scss';
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
    <div>
      <Show when={data.loading}>
        <div class={page.loading} role="status" aria-label="Loading collection">
          <Skeleton height="56px" radius="sm" />
        </div>
      </Show>
      <Show when={data.error || !props.institution}>
        <p class={page.muted}>Sign in to check the sources available to your account.</p>
      </Show>
      <Show when={data()?.items.length}>
        <ul class={page.list}>
          <For each={data()?.items}>
            {(s) => (
              <li>
                <a href={`#/sources/${s.id}`} class={page.row}>
                  <span class={page.rowIcon} aria-hidden="true">
                    <BookOpen size={20} />
                  </span>
                  <span class={page.rowText}>
                    {s.title}
                    <span class={page.meta}>{kindText(s.kind)}</span>
                  </span>
                  <span class={page.rowEnd}>
                    <Badge tone={sourceBadge(s).tone} dot>
                      {sourceBadge(s).label}
                    </Badge>
                  </span>
                </a>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Show when={data() && !data()?.items.length}>
        <p class={page.muted}>No documents are available to your account yet.</p>
      </Show>
    </div>
  );
}
