import { createEffect, createSignal, For, Show } from 'solid-js';
import { createRemoteResource as createResource } from './resource';
import { BookOpen, Download, ExternalLink } from 'lucide-solid';
import { get, errorText, safeLink } from './api';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
export default function Sources(props: {
  institution: string;
  source?: string;
  citation?: string;
}) {
  const [cursor, setCursor] = createSignal('');
  const [versionCursor,setVersionCursor]=createSignal('');
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
    () => source() ? {source:source()!,cursor:versionCursor()} : false,
    (key) =>
      get(
        scoped(key.source.institution_id, '/sources/{source_id}/versions', { source_id: key.source.id })+pageSuffix(key.cursor),
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
  return (
    <section class="sources">
      <Show when={!props.citation}>
        <h1 tabIndex={-1}>{props.source ? 'Source reader' : 'Source collection'}</h1>
        <p class="muted">Original documents, with their versions and publication status.</p>
      </Show>
      <Show when={!props.institution}>
        <p class="notice">
          The collection is unavailable. Please return when the institution list is available.
        </p>
      </Show>
      <Show when={loading()}>
        <div class="skeleton" role="status" aria-label="Loading sources" />
      </Show>
      <Show when={error()}>
        <div class="notice" role="alert">
          {errorText(error())} <a href="#/auth">Sign in</a>
        </div>
      </Show>
      <Show when={sources()}>
        {(data) => (
          <>
            <For each={data().items} fallback={<p>No sources are available to your account.</p>}>
              {(s) => (
                <a class="list-row" href={`#/sources/${s.id}`}>
                  <BookOpen size={20} />
                  <span>
                    {s.title}
                    <small>
                      {s.kind.toUpperCase()} ·{' '}
                      {s.current_version_id ? 'Version available' : 'Awaiting a current version'}
                    </small>
                  </span>
                </a>
              )}
            </For>
            <Show when={data().next_cursor}>
              <button onClick={() => setCursor(data().next_cursor!)}>Next page</button>
            </Show>
            <Show when={cursor()}>
              <button onClick={() => setCursor('')}>First page</button>
            </Show>
          </>
        )}
      </Show>
      <Show when={source()}>
        {(s) => (
          <>
            <h2>{s().title}</h2>
            <Show when={safeLink(s().original_url)}>
              {(url) => (
                <a href={url()} target="_blank" rel="noopener noreferrer">
                  Original website <ExternalLink size={16} />
                </a>
              )}
            </Show>
            <For each={versions()?.items}>
              {(v) => (
                <article class="version-row">
                  <h3>{v.label}</h3>
                  <p>
                    {v.status} · Indexing: {v.indexing}
                  </p>
                  <p>
                    Effective:{' '}
                    {v.effective_from
                      ? new Date(v.effective_from).toLocaleDateString()
                      : 'Not specified'}{' '}
                    —{' '}
                    {v.effective_until
                      ? new Date(v.effective_until).toLocaleDateString()
                      : 'No end date supplied'}
                  </p>
                  <a
                    href={scoped(props.institution, '/versions/{version_id}/file', {
                      version_id: v.id,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Download size={16} />
                    Open original version
                  </a>
                </article>
              )}
            </For>
          </>
        )}
      </Show>
      <Show when={props.source}><Pagination cursor={versionCursor()} next={versions()?.next_cursor} change={setVersionCursor} label="Version pages"/></Show>
      <Show when={evidence()}>
        {(e) => (
          <article class="reader" ref={reader} tabIndex={-1} aria-label="Source citation">
            <h3>{e().title}</h3>
            <p>
              {e().version_label} ·{' '}
              {e().locator.page ? `Page ${e().locator.page}` : e().locator.section}
            </p>
            <p class="status">
              {version()
                ? `${version()!.status} · ${version()!.indexing}`
                : 'Checking version status…'}
            </p>
            <Show
              when={
                version()?.effective_until && Date.parse(version()!.effective_until!) < Date.now()
              }
            >
              <p class="notice">Expired version · historical citation</p>
            </Show>
            <blockquote>{e().quote}</blockquote>
            <Show when={chunk()}>
              <details>
                <summary>Read source passage</summary>
                <p class="passage">{chunk()!.text}</p>
              </details>
            </Show>
            <a
              href={`${scoped(props.institution, '/versions/{version_id}/file', { version_id: e().version_id })}${e().locator.page ? `#page=${e().locator.page}` : ''}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={16} />
              Open original · {e().version_label}
            </a>
            <Show when={safeLink(e().original_url)}>
              {(url) => (
                <a href={url()} target="_blank" rel="noopener noreferrer">
                  Original website <ExternalLink size={16} />
                </a>
              )}
            </Show>
          </article>
        )}
      </Show>
    </section>
  );
}
