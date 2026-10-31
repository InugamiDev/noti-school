import { createEffect, createMemo, createSignal, For, Show } from 'solid-js';
import { LoadingStatus, SkeletonList } from './ui/Loader';
import { createRemoteResource as createResource, accessScope } from './resource';
import { ArrowLeft, BookOpen, ExternalLink, Search, X } from 'lucide-solid';
import { get, errorText, safeLink } from './api';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
import { SourceRow, formatLabel, type SourceItem, type VersionItem } from './CollectionPreview';
import { DownloadButton, fileName } from './ui/Download';
import { formatDate, type Lang } from './ui/format';
import { t } from './ui/i18n';
import './ui/sources.css';

// Diacritic- and case-insensitive matching so "quy che" finds "Quy chế".
const fold = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const squash = (value: string) => value.replace(/\s+/g, ' ').trim();
export const ended = (v: VersionItem) => !!v.effective_until && Date.parse(v.effective_until) < Date.now();

/** In-app reader for one edition; a cited passage and page bring the reader to that spot. */
export const documentHref = (sourceId: string, versionId: string, locate?: { page?: number | null; chunk?: string; fromAnswer?: boolean }) => {
  const query = new URLSearchParams();
  if (locate?.page) query.set('page', String(locate.page));
  if (locate?.chunk) query.set('chunk', locate.chunk);
  if (locate?.fromAnswer) query.set('from', 'answer');
  const suffix = query.toString();
  return `#/sources/${sourceId}/versions/${versionId}${suffix ? `?${suffix}` : ''}`;
};

/** Student-facing wording for review states; approved needs no extra words. */
const statusWords: Record<VersionItem['status'], string> = {
  draft: 'Draft · not yet published',
  quarantined: 'Held for safety checks',
  pending_review: 'Awaiting review',
  approved: '',
  archived: '',
  failed: 'Could not be processed',
};
const indexingWords: Record<VersionItem['indexing'], string> = {
  pending: 'Being prepared for search',
  running: 'Being prepared for search',
  ready: '',
  failed: 'Not searchable right now',
  disabled: 'Not used for answers',
};

export function validity(v: VersionItem) {
  if (ended(v)) return `Ended ${formatDate(v.effective_until!)}`;
  if (v.effective_from) {
    const from = `In effect from ${formatDate(v.effective_from)}`;
    return v.effective_until ? `${from} until ${formatDate(v.effective_until)}` : from;
  }
  if (v.effective_until) return `In effect until ${formatDate(v.effective_until)}`;
  return v.status === 'archived' ? '' : t('en', 'inEffect');
}

export default function Sources(props: {
  institution: string;
  source?: string;
  citation?: string;
  lang?: Lang;
  /** Closes the citation reader; rendered as a close button when supplied. */
  onClose?: () => void;
}) {
  const [cursor, setCursor] = createSignal('');
  const [versionCursor, setVersionCursor] = createSignal('');
  const [query, setQuery] = createSignal('');
  const [format, setFormat] = createSignal<SourceItem['kind'] | ''>('');
  let reader: HTMLElement | undefined;
  let searchInput: HTMLInputElement | undefined;
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
        scoped(key.source.institution_id, '/sources/{source_id}/versions', {
          source_id: key.source.id,
        }) + pageSuffix(key.cursor),
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
  // The cited document's format decides the download's file extension.
  const [origin] = createResource(
    () => evidence(),
    (e) => get(scoped(e.institution_id, '/sources/{source_id}', { source_id: e.source_id }), 'Source'),
  );
  createEffect(() => {
    if (evidence()) queueMicrotask(() => reader?.focus());
  });
  // Search and format chips only filter the page already loaded; nothing extra is requested.
  const formats = createMemo(() => [...new Set(sources()?.items.map((s) => s.kind) ?? [])]);
  const visible = createMemo(() => {
    const needle = fold(query().trim());
    return (sources()?.items ?? []).filter(
      (s) => (!format() || s.kind === format()) && (!needle || fold(s.title).includes(needle)),
    );
  });
  const filtering = () => !!query().trim() || !!format();
  const clearFilters = () => {
    setQuery('');
    setFormat('');
    searchInput?.focus();
  };
  const changePage = (next: string) => {
    setCursor(next);
    setQuery('');
    setFormat('');
  };
  // The session check runs first; requests start once the access scope is known.
  const loading = () =>
    (accessScope() === 'initial' && !!props.institution) ||
    sources.loading ||
    source.loading ||
    evidence.loading ||
    versions.loading;
  const error = () =>
    sources.error || source.error || evidence.error || versions.error || version.error || chunk.error;
  const lang = () => props.lang ?? 'en';
  return (
    <section class="sources">
      <Show when={!props.citation && !props.source}>
        <h1 tabIndex={-1}>Sources</h1>
        <p class="muted">Original documents available to your account, with their current editions.</p>
      </Show>
      <Show when={props.source}>
        <a class="back-link" href="#/sources">
          <ArrowLeft size={16} aria-hidden="true" />
          All sources
        </a>
        {/* Always rendered so route focus lands here; the title fills in once loaded. */}
        <h1 tabIndex={-1} class="source-title">
          {source()?.title ?? 'Source document'}
        </h1>
      </Show>
      <Show when={!props.institution}>
        <p class="notice">
          The collection is unavailable. Please return when the institution list is available.
        </p>
      </Show>
      <Show when={loading()}>
        <LoadingStatus>{props.citation ? 'Opening the passage…' : 'Loading sources…'}</LoadingStatus>
        <SkeletonList rows={props.citation ? 1 : 4} />
      </Show>
      <Show when={error()}>
        <div class="notice" role="alert">
          {errorText(error())} <a href="#/auth">Sign in</a>
        </div>
      </Show>
      <Show when={sources()}>
        {(data) => (
          <>
            <Show when={data().items.length}>
              <div class="source-filters">
                <label class="source-search">
                  <span class="source-search-label">Search documents</span>
                  <span class="source-search-field">
                    <Search size={18} aria-hidden="true" />
                    <input
                      ref={searchInput}
                      type="search"
                      value={query()}
                      onInput={(e) => setQuery(e.currentTarget.value)}
                      placeholder="Title, e.g. regulation"
                      autocomplete="off"
                    />
                  </span>
                </label>
                <Show when={formats().length > 1}>
                  <div class="format-chips" role="group" aria-label="Filter by format">
                    <button
                      type="button"
                      class="chip-button"
                      aria-pressed={format() === ''}
                      onClick={() => setFormat('')}
                    >
                      All formats
                    </button>
                    <For each={formats()}>
                      {(kind) => (
                        <button
                          type="button"
                          class="chip-button"
                          aria-pressed={format() === kind}
                          onClick={() => setFormat(format() === kind ? '' : kind)}
                        >
                          {formatLabel(kind)}
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={data().next_cursor || cursor()}>
                  <p class="source-filter-hint">Search covers the documents on this page.</p>
                </Show>
              </div>
            </Show>
            <Show when={filtering()}>
              <p class="source-count" role="status">
                {visible().length} of {data().items.length} documents
              </p>
            </Show>
            <For
              each={visible()}
              fallback={
                <Show
                  when={filtering()}
                  fallback={
                    <div class="source-empty">
                      <p>No sources are available to your account yet.</p>
                      <p>
                        <a href="#/auth">Redeem an invitation</a> from your institution, or <a href="#/help">read how collections are added</a>.
                      </p>
                    </div>
                  }
                >
                      <div class="source-empty">
                    <p>
                      No documents on this page match
                      {query().trim() ? ` “${query().trim()}”` : ' that format'}.
                    </p>
                    <button type="button" onClick={clearFilters}>
                      <X size={16} aria-hidden="true" />
                      Clear search
                    </button>
                  </div>
                </Show>
              }
            >
              {(s, i) => <SourceRow source={s} index={i()} />}
            </For>
            <Pagination
              cursor={cursor()}
              next={data().next_cursor}
              change={changePage}
              label="Source pages"
            />
          </>
        )}
      </Show>
      <Show when={source()}>
        {(s) => (
          <>
            <p class="source-facts">
              <span class="format-tag">{formatLabel(s().kind)}</span>
              <Show when={safeLink(s().original_url)}>
                {(url) => (
                  <a href={url()} target="_blank" rel="noopener noreferrer">
                    {t('en', 'publisherPage')} <ExternalLink size={16} aria-hidden="true" />
                  </a>
                )}
              </Show>
            </p>
            <h2 class="versions-heading">Editions</h2>
            <For
              each={versions()?.items}
              fallback={
                <Show when={versions()}>
                  <p class="muted">No editions of this document are available yet.</p>
                </Show>
              }
            >
              {(v, i) => {
                const isCurrent = () => v.id === s().current_version_id && v.status !== 'archived' && !ended(v);
                const old = () => v.status === 'archived' || ended(v);
                const note = () =>
                  [statusWords[v.status], v.status === 'approved' ? indexingWords[v.indexing] : '']
                    .filter(Boolean)
                    .join(' · ');
                return (
                  <article class="version-row stagger-in" classList={{ 'version-old': old() }} style={{ '--i': i() }}>
                    <div class="version-head">
                      <h3>{v.label}</h3>
                      <Show when={isCurrent()}>
                        <span class="chip chip-current">{t('en', 'current')}</span>
                      </Show>
                      <Show when={!isCurrent() && old()}>
                        <span class="chip chip-old">{t('en', 'superseded')}</span>
                      </Show>
                    </div>
                    <Show when={validity(v)}>{(text) => <p>{text()}</p>}</Show>
                    <Show when={note()}>{(text) => <p class="version-note">{text()}</p>}</Show>
                    <div class="version-actions">
                      <a href={documentHref(s().id, v.id)}>
                        <BookOpen size={16} aria-hidden="true" />
                        Open original version
                      </a>
                      <DownloadButton
                        href={scoped(props.institution, '/versions/{version_id}/file', { version_id: v.id })}
                        filename={fileName(s().title, v.label, s().kind)}
                        label={`${t('en', 'downloadOriginal')} (${formatLabel(s().kind)})`}
                      />
                    </div>
                  </article>
                );
              }}
            </For>
          </>
        )}
      </Show>
      <Show when={props.source}>
        <Pagination
          cursor={versionCursor()}
          next={versions()?.next_cursor}
          change={setVersionCursor}
          label="Version pages"
        />
      </Show>
      <Show when={evidence()}>
        {(e) => {
          const expired = () => !!version() && ended(version()!);
          const superseded = () => expired() || version()?.status === 'archived';
          const locator = () =>
            [
              e().locator.page ? `${t(lang(), 'page')} ${e().locator.page}` : '',
              e().locator.section ? `${t(lang(), 'section')}: ${e().locator.section}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
          // Only offer the full passage when it adds something beyond the quote.
          const fuller = () => {
            const text = chunk()?.text;
            return text && squash(text) !== squash(e().quote) ? text : undefined;
          };
          return (
            <article class="reader" ref={reader} tabIndex={-1} aria-label="Source citation">
              <Show when={props.onClose}>
                <button type="button" class="reader-close" aria-label={t(lang(), 'closePassage')} onClick={() => props.onClose?.()}>
                  <X size={18} aria-hidden="true" />
                </button>
              </Show>
              <h3>{e().title}</h3>
              <p class="reader-meta">
                <span>{e().version_label}</span>
                <Show when={locator()}>
                  <span>{locator()}</span>
                </Show>
                <Show when={superseded()}>
                  <span class="chip chip-old">{t(lang(), 'superseded')}</span>
                </Show>
                <Show when={version()?.status === 'approved' && !expired()}>
                  <span class="chip chip-current">{t(lang(), 'inEffect')}</span>
                </Show>
              </p>
              <Show when={expired()}>
                <p class="notice">Expired version · historical citation</p>
              </Show>
              <blockquote>{e().quote}</blockquote>
              <Show when={fuller()}>
                {(text) => (
                  <details>
                    <summary>{t(lang(), 'showFullPassage')}</summary>
                    <p class="passage">{text()}</p>
                  </details>
                )}
              </Show>
              <div class="reader-links">
                <a
                  class="reader-open"
                  href={documentHref(e().source_id, e().version_id, { page: e().locator.page, chunk: e().chunk_id, fromAnswer: true })}
                >
                  <BookOpen size={16} aria-hidden="true" />
                  {t(lang(), 'openOriginal')}
                  {e().locator.page ? ` · ${t(lang(), 'page')} ${e().locator.page}` : ''}
                </a>
                <DownloadButton
                  href={scoped(props.institution, '/versions/{version_id}/file', { version_id: e().version_id })}
                  filename={fileName(e().title, e().version_label, origin()?.kind)}
                  label={`${t(lang(), 'downloadOriginal')} (${e().version_label})`}
                />
                <Show when={safeLink(e().original_url)}>
                  {(url) => (
                    <a href={url()} target="_blank" rel="noopener noreferrer">
                      {t(lang(), 'publisherPage')} <ExternalLink size={16} aria-hidden="true" />
                    </a>
                  )}
                </Show>
              </div>
            </article>
          );
        }}
      </Show>
    </section>
  );
}
