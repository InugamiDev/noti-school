// intent: source library (filterable list with status badges), source reader (versions with approved/superseded/under
//         review badges) and the citation reader, on the Clay kit; requests and scope checks are unchanged.
// status: done
// next: the filter only covers the loaded page; a server-side search would need a new endpoint.
// confidence: high
import { createEffect, createSignal, For, Match, Show, Switch } from 'solid-js';
import { createRemoteResource as createResource } from './resource';
import { BookOpen, Download, ExternalLink, FileText, Library, SearchX, TriangleAlert } from 'lucide-solid';
import { get, errorText, safeLink } from './api';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
import { Badge, Button, cx, EmptyState, SearchInput, Skeleton } from './ui';
import {
  effectiveText,
  filterSources,
  indexingText,
  kindText,
  locatorText,
  sourceBadge,
  versionBadge,
} from './app/workspace';
import page from './app/Page.module.scss';

const dateText = (iso: string) => new Date(iso).toLocaleDateString();

export default function Sources(props: {
  institution: string;
  source?: string;
  citation?: string;
}) {
  const [cursor, setCursor] = createSignal('');
  const [versionCursor, setVersionCursor] = createSignal('');
  const [query, setQuery] = createSignal('');
  let reader: HTMLElement | undefined;
  const [sources] = createResource(
    () =>
      props.institution && !props.source && !props.citation
        ? { id: props.institution, cursor: cursor() }
        : false,
    (key) =>
      get(
        scoped(key.id, '/sources') +
          (key.cursor ? `?cursor=${encodeURIComponent(key.cursor)}` : ''),
        'SourcePage',
      ),
  );
  const [source] = createResource(
    () =>
      props.institution && props.source ? { id: props.institution, source: props.source } : false,
    (key) => get(scoped(key.id, '/sources/{source_id}', { source_id: key.source }), 'Source'),
  );
  const [versions] = createResource(
    () => (source() ? { source: source()!, cursor: versionCursor() } : false),
    (key) =>
      get(
        scoped(key.source.institution_id, '/sources/{source_id}/versions', { source_id: key.source.id }) +
          pageSuffix(key.cursor),
        'VersionPage',
      ),
  );
  const [evidence] = createResource(
    () =>
      props.institution && props.citation
        ? { id: props.institution, citation: props.citation }
        : false,
    (key) =>
      get(scoped(key.id, '/citations/{citation_id}', { citation_id: key.citation }), 'Evidence'),
  );
  const [version] = createResource(
    () => evidence(),
    (e) =>
      get(
        scoped(e.institution_id, '/versions/{version_id}', { version_id: e.version_id }),
        'Version',
      ),
  );
  const [chunk] = createResource(
    () => evidence(),
    (e) => get(scoped(e.institution_id, '/chunks/{chunk_id}', { chunk_id: e.chunk_id }), 'Chunk'),
  );
  createEffect(() => {
    if (evidence()) queueMicrotask(() => reader?.focus());
  });
  const loading = () => sources.loading || source.loading || evidence.loading || versions.loading;
  const error = () =>
    sources.error ||
    source.error ||
    evidence.error ||
    versions.error ||
    version.error ||
    chunk.error;
  const visible = () => filterSources(sources()?.items ?? [], query());
  return (
    <section>
      <Show when={!props.citation}>
        <h1 class={page.title} tabIndex={-1}>
          {props.source ? 'Source reader' : 'Source library'}
        </h1>
        <p class={page.lede}>
          Original documents shared with your account, with their versions and review status.
        </p>
      </Show>
      <Show when={!props.institution}>
        <p class={page.notice}>
          <Library size={18} aria-hidden="true" />
          The collection is unavailable. Please return when the institution list is available.
        </p>
      </Show>
      <Show when={loading()}>
        <div class={page.loading} role="status" aria-label="Loading sources">
          <Skeleton height="56px" radius="sm" />
          <Skeleton height="56px" radius="sm" />
          <Show when={!props.citation}>
            <Skeleton height="56px" radius="sm" />
          </Show>
        </div>
      </Show>
      <Show when={error()}>
        <div class={cx(page.notice, page.error)} role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          <div class={page.noticeBody}>
            <p>{errorText(error())}</p>
            <div class={page.links}>
              <Button size="sm" href="#/auth">
                Sign in
              </Button>
            </div>
          </div>
        </div>
      </Show>
      <Show when={sources()}>
        {(data) => (
          <>
            <Show when={data().items.length}>
              <div class={page.toolbar}>
                <SearchInput
                  label="Filter sources on this page"
                  placeholder="Filter by title or format"
                  value={query()}
                  onInput={setQuery}
                />
              </div>
            </Show>
            <Switch
              fallback={
                <ul class={page.list}>
                  <For each={visible()}>
                    {(s) => {
                      const badge = () => sourceBadge(s);
                      return (
                        <li>
                          <a class={page.row} href={`#/sources/${s.id}`}>
                            <span class={page.rowIcon} aria-hidden="true">
                              <BookOpen size={20} />
                            </span>
                            <span class={page.rowText}>
                              {s.title}
                              <span class={page.meta}>{kindText(s.kind)}</span>
                            </span>
                            <span class={page.rowEnd}>
                              <Badge tone={badge().tone} dot>
                                {badge().label}
                              </Badge>
                            </span>
                          </a>
                        </li>
                      );
                    }}
                  </For>
                </ul>
              }
            >
              <Match when={!data().items.length}>
                <EmptyState icon={Library} title="No sources yet" body="No sources are available to your account." />
              </Match>
              <Match when={!visible().length}>
                <EmptyState
                  icon={SearchX}
                  title="No matching sources"
                  body="No document on this page matches the filter."
                  action={
                    <Button size="sm" onClick={() => setQuery('')}>
                      Clear filter
                    </Button>
                  }
                />
              </Match>
            </Switch>
            <Pagination
              cursor={cursor()}
              next={data().next_cursor}
              change={(next) => {
                setQuery('');
                setCursor(next);
              }}
              label="Source pages"
            />
          </>
        )}
      </Show>
      <Show when={source()}>
        {(s) => (
          <>
            <h2 class={page.h2}>{s().title}</h2>
            <Show when={safeLink(s().original_url)}>
              {(url) => (
                <a class={page.link} href={url()} target="_blank" rel="noopener noreferrer">
                  Original website <ExternalLink size={16} aria-hidden="true" />
                </a>
              )}
            </Show>
            <Show when={versions() && !versions()!.items.length}>
              <EmptyState icon={FileText} title="No versions yet" body="This source has no versions available to your account." />
            </Show>
            <For each={versions()?.items}>
              {(v) => {
                const badge = () => versionBadge(v, s().current_version_id);
                return (
                  <article class={page.item}>
                    <div class={page.itemHead}>
                      <h3 class={page.h3}>{v.label}</h3>
                      <Badge tone={badge().tone} dot>
                        {badge().label}
                      </Badge>
                    </div>
                    <p class={page.small}>
                      {indexingText(v.indexing)}. {effectiveText(v.effective_from, v.effective_until, dateText)}
                    </p>
                    <a
                      class={page.link}
                      href={scoped(props.institution, '/versions/{version_id}/file', {
                        version_id: v.id,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download size={16} aria-hidden="true" />
                      Open original version
                    </a>
                  </article>
                );
              }}
            </For>
          </>
        )}
      </Show>
      <Show when={props.source}>
        <Pagination cursor={versionCursor()} next={versions()?.next_cursor} change={setVersionCursor} label="Version pages" />
      </Show>
      <Show when={evidence()}>
        {(e) => (
          <article class={cx(page.card, page.reader)} ref={reader} tabIndex={-1} aria-label="Source citation" data-reader>
            <h3 class={page.h3}>{e().title}</h3>
            <p class={page.meta}>{[e().version_label, locatorText(e().locator)].filter(Boolean).join(' · ')}</p>
            <div class={page.itemHead}>
              <Show when={version()} fallback={<span class={page.small}>Checking version status…</span>}>
                {(v) => {
                  const badge = () => versionBadge(v(), undefined);
                  return (
                    <>
                      <Badge tone={badge().tone} dot>
                        {badge().label}
                      </Badge>
                      <span class={page.small}>{indexingText(v().indexing)}</span>
                    </>
                  );
                }}
              </Show>
            </div>
            <Show when={version()?.effective_until && Date.parse(version()!.effective_until!) < Date.now()}>
              <p class={page.notice}>Expired version · historical citation</p>
            </Show>
            <blockquote class={page.quote}>{e().quote}</blockquote>
            <Show when={chunk()}>
              <details class={page.details}>
                <summary>Read source passage</summary>
                <p class={page.passage}>{chunk()!.text}</p>
              </details>
            </Show>
            <div class={page.actions}>
              <a
                class={page.link}
                href={`${scoped(props.institution, '/versions/{version_id}/file', { version_id: e().version_id })}${e().locator.page ? `#page=${e().locator.page}` : ''}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download size={16} aria-hidden="true" />
                Open original · {e().version_label}
              </a>
              <Show when={safeLink(e().original_url)}>
                {(url) => (
                  <a class={page.link} href={url()} target="_blank" rel="noopener noreferrer">
                    Original website <ExternalLink size={16} aria-hidden="true" />
                  </a>
                )}
              </Show>
            </div>
          </article>
        )}
      </Show>
    </section>
  );
}
