// intent: source library (filterable list with status badges), source reader (versions with approved/superseded/under
//         review badges) and the citation reader, on the Clay kit; requests and scope checks are unchanged.
// status: done
// next: the filter only covers the loaded page; a server-side search would need a new endpoint. Loading renders
//       skeletons shaped like the list (filter field and rows), and the unavailable notice only after the school list failed.
// confidence: high
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { createRemoteResource as createResource } from './resource';
import { BookOpen, Download, ExternalLink, FileText, Library, SearchX, TriangleAlert } from 'lucide-solid';
import { get, errorText, RequestError, safeLink } from './api';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
import {
  Badge,
  Button,
  cx,
  EmptyState,
  LoadingRegion,
  SearchInput,
  Skeleton,
  SkeletonRow,
  SkeletonText,
} from './ui';
import {
  effectiveText,
  filterSources,
  formatDate,
  indexingText,
  isAccessCode,
  kindText,
  locatorText,
  sourceBadge,
  versionBadge,
} from './app/workspace';
import page from './app/Page.module.scss';

const dateText = formatDate;

export default function Sources(props: {
  institution: string;
  source?: string;
  citation?: string;
  /** Identity or the school list is still resolving. */
  pending?: boolean;
  /** The school list failed or is empty. */
  unavailable?: boolean;
  /** When the visitor started waiting, so a remount keeps a shown skeleton. */
  since?: number;
}) {
  const [cursor, setCursor] = createSignal('');
  const [versionCursor, setVersionCursor] = createSignal('');
  const [query, setQuery] = createSignal('');
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
  const loading = () =>
    !!props.pending || sources.loading || source.loading || evidence.loading || versions.loading;
  const error = () =>
    sources.error ||
    source.error ||
    evidence.error ||
    versions.error ||
    version.error;
  const visible = () => filterSources(sources()?.items ?? [], query());
  return (
    <section>
      <Show when={!props.citation}>
        <h1 class={page.title} tabIndex={-1}>
          {props.source ? 'Source reader' : 'Source library'}
        </h1>
        <p class={page.lede}>
          {props.source
            ? 'One document and all of its editions. The current edition is marked.'
            : 'Original documents shared with your account, with their versions and review status.'}
        </p>
      </Show>
      <Show when={props.unavailable && !props.institution}>
        <p class={page.notice}>
          <Library size={18} aria-hidden="true" />
          The collection is unavailable. Please return when the institution list is available.
        </p>
      </Show>
      <LoadingRegion
        loading={loading()}
        since={props.since}
        label={props.citation ? 'Loading citation…' : props.source ? 'Loading source…' : 'Loading sources…'}
        skeleton={
          <Switch
            fallback={
              <>
                <div class={page.toolbar}>
                  <Skeleton height="44px" radius="sm" />
                </div>
                <ul class={page.list}>
                  <li><SkeletonRow pill /></li>
                  <li><SkeletonRow pill titleWidth="42%" /></li>
                  <li><SkeletonRow pill titleWidth="64%" /></li>
                </ul>
              </>
            }
          >
            <Match when={props.citation}>
              <div class={cx(page.card, page.reader)}>
                <SkeletonText class={page.h3} width="70%" />
                <SkeletonText class={page.meta} width="40%" />
                <SkeletonText lines={3} />
              </div>
            </Match>
            <Match when={props.source}>
              <SkeletonText class={page.h2} width="50%" />
              <div class={page.item}>
                <SkeletonText class={page.h3} width="30%" />
                <SkeletonText class={page.small} width="70%" />
              </div>
            </Match>
          </Switch>
        }
      >
        <Show when={error()}>
          <div class={cx(page.notice, page.error)} role="alert">
            <TriangleAlert size={18} aria-hidden="true" />
            <div class={page.noticeBody}>
              <p>{errorText(error())}</p>
              {/* Offer sign-in only when the failure is about access, not for an outage or a missing item. */}
              <Show when={error() instanceof RequestError && isAccessCode((error() as RequestError).code)}>
                <div class={page.links}>
                  <Button size="sm" href="#/auth">
                    Sign in
                  </Button>
                </div>
              </Show>
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
                              <BookOpen class={cx(page.rowGlyph)} size={18} aria-hidden="true" />
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
                        {indexingText(v.indexing)}.
                        <Show when={v.effective_from || v.effective_until}>
                          {' '}
                          {effectiveText(v.effective_from, v.effective_until, dateText)}
                        </Show>
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
            <article class={cx(page.card, page.reader)} ref={(element) => queueMicrotask(() => element.focus())}
              tabIndex={-1} aria-label="Source citation" data-reader>
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
              <Show when={chunk.error}>
                <p class={page.small}>This passage could not be loaded. Open the original instead.</p>
              </Show>
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
      </LoadingRegion>
    </section>
  );
}
