import { createEffect, createMemo, createSignal, For, on, Show } from 'solid-js';
import { ArrowLeft, ExternalLink } from 'lucide-solid';
import type { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import { get, errorText, safeLink, RequestError } from './api';
import { createRemoteResource as createResource } from './resource';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
import { formatLabel } from './CollectionPreview';
import { ended, validity } from './Sources';
import { LoadingStatus, SkeletonLines } from './ui/Loader';
import { DownloadButton, fileName } from './ui/Download';
import { t } from './ui/i18n';
import { motionAllowed } from './ui/motion';
import './ui/document.css';

type Chunk = z.infer<typeof Schemas.Chunk>;
const status = (error: unknown) => (error instanceof RequestError ? error.status : 0);

// intent: read an original document edition inside the app. Admins see every extracted passage grouped
// by page; members see the passage a citation points at plus a credentialed download. The API file URL
// is fetched, never navigated to.
export default function DocumentView(props: {
  institution: string;
  source: string;
  version: string;
  /** Query string after the route: page=N, chunk=<id>, from=answer. */
  query: string;
}) {
  const params = createMemo(() => new URLSearchParams(props.query));
  const citedId = () => params().get('chunk') ?? '';
  const pageParam = () => params().get('page') ?? '';
  const fromAnswer = () => params().get('from') === 'answer';
  const [cursor, setCursor] = createSignal('');
  const [source, { refetch: refetchSource }] = createResource(
    () => (props.institution && props.source ? { i: props.institution, s: props.source } : false),
    (k) => get(scoped(k.i, '/sources/{source_id}', { source_id: k.s }), 'Source'),
  );
  const [version, { refetch: refetchVersion }] = createResource(
    () => (props.institution && props.version ? { i: props.institution, v: props.version } : false),
    (k) => get(scoped(k.i, '/versions/{version_id}', { version_id: k.v }), 'Version'),
  );
  const [chunks, { refetch: refetchChunks }] = createResource(
    () => (props.institution && props.version ? { i: props.institution, v: props.version, cursor: cursor() } : false),
    (k) => get(scoped(k.i, '/versions/{version_id}/chunks', { version_id: k.v }) + pageSuffix(k.cursor), 'ChunkPage'),
  );
  const [cited] = createResource(
    () => (props.institution && citedId() ? { i: props.institution, c: citedId() } : false),
    (k) => get(scoped(k.i, '/chunks/{chunk_id}', { chunk_id: k.c }), 'Chunk'),
  );
  const retry = () => {
    void refetchSource();
    void refetchVersion();
    void refetchChunks();
  };
  // Listing passages is an admin operation; members fall back to the cited passage and the download.
  const forbidden = () => [401, 403].includes(status(chunks.error));
  const missing = () => status(source.error) === 404 || status(version.error) === 404;
  const blocked = () => [401, 403].includes(status(source.error)) || [401, 403].includes(status(version.error));
  const headError = () => (!missing() && !blocked() ? source.error || version.error : undefined);
  const listed = (id: string) => (chunks()?.items ?? []).some((c) => c.id === id);
  const groups = createMemo(() => {
    const out: { key: string; title: string; items: Chunk[] }[] = [];
    for (const c of chunks()?.items ?? []) {
      const byPage = c.locator.page !== null && c.locator.page !== undefined;
      const key = byPage ? `p${c.locator.page}` : `s${c.locator.section ?? ''}`;
      const title = byPage ? `${t('en', 'page')} ${c.locator.page}` : c.locator.section || 'Document';
      const last = out.at(-1);
      if (last && last.key === key) last.items.push(c);
      else out.push({ key, title, items: [c] });
    }
    return out;
  });
  const locator = (c: Chunk) =>
    [c.locator.page !== null ? `${t('en', 'page')} ${c.locator.page}` : '', c.locator.section ?? '']
      .filter(Boolean)
      .join(' · ');
  const fileHref = () => scoped(props.institution, '/versions/{version_id}/file', { version_id: props.version });
  // Once passages are on the page, bring the cited one (or the requested page) into view.
  createEffect(
    on([() => chunks(), () => cited()], () => {
      if (!chunks() && !cited()) return;
      queueMicrotask(() => {
        const target =
          document.getElementById(`passage-${citedId()}`) ??
          (pageParam() ? document.getElementById(`page-${pageParam()}`) : null);
        if (!target) return;
        target.scrollIntoView({ block: 'center', behavior: motionAllowed(target) ? 'smooth' : 'auto' });
        target.focus({ preventScroll: true });
      });
    }),
  );
  return (
    <section class="document">
      <nav class="document-nav" aria-label="Document navigation">
        <Show
          when={fromAnswer() && history.length > 1}
          fallback={
            <a class="back-link" href={`#/sources/${props.source}`}>
              <ArrowLeft size={16} aria-hidden="true" />
              {source()?.title ? 'Document editions' : 'All sources'}
            </a>
          }
        >
          <button type="button" class="back-link link-button" onClick={() => history.back()}>
            <ArrowLeft size={16} aria-hidden="true" />
            {t('en', 'backToAnswer')}
          </button>
        </Show>
        <span class="document-bar-title" aria-hidden="true">{source()?.title ?? ''}</span>
      </nav>
      <h1 tabIndex={-1} class="source-title">{source()?.title ?? (source.loading ? 'Document' : 'Document not available')}</h1>
      <Show when={version()}>
        {(v) => (
          <p class="document-meta">
            <span class="document-edition">{v().label}</span>
            <Show when={v().status === 'archived' || ended(v())} fallback={<span class="chip chip-current">{t('en', 'current')}</span>}>
              <span class="chip chip-old">{t('en', 'superseded')}</span>
            </Show>
            <Show when={validity(v())}>{(text) => <span>{text()}</span>}</Show>
            <Show when={source()}>{(s) => <span class="format-tag">{formatLabel(s().kind)}</span>}</Show>
          </p>
        )}
      </Show>
      <Show when={source() && version()}>
        <div class="document-actions">
          <DownloadButton
            href={fileHref()}
            filename={fileName(source()!.title, version()!.label, source()!.kind)}
            label={`${t('en', 'downloadOriginal')} (${formatLabel(source()!.kind)})`}
          />
          <Show when={safeLink(source()!.original_url)}>
            {(url) => (
              <a href={url()} target="_blank" rel="noopener noreferrer">
                {t('en', 'publisherPage')} <ExternalLink size={16} aria-hidden="true" />
              </a>
            )}
          </Show>
        </div>
      </Show>
      <Show when={missing()}>
        <div class="notice" role="alert">
          This document edition is not available. It may have been removed. <a href="#/sources">Browse sources</a>
        </div>
      </Show>
      <Show when={blocked()}>
        <div class="notice" role="alert">
          Your account does not have access to this document. <a href="#/auth">Sign in</a> with a member account.
        </div>
      </Show>
      <Show when={headError()}>
        <div class="notice" role="alert">
          {errorText(headError())} <button type="button" class="link-button" onClick={retry}>{t('en', 'tryAgain')}</button>
        </div>
      </Show>
      <Show when={(source.loading || version.loading || (chunks.loading && !chunks())) && !missing() && !blocked()}>
        <LoadingStatus>Opening the document…</LoadingStatus>
        <SkeletonLines lines={6} class="document-skeleton" />
      </Show>
      <Show when={cited() && (forbidden() || !listed(cited()!.id))}>
        {(_) => (
          <article class="document-cited is-cited" id={`passage-${cited()!.id}`} tabIndex={-1} aria-label="Cited passage">
            <h2>Cited passage</h2>
            <Show when={locator(cited()!)}>{(text) => <p class="document-locator">{text()}</p>}</Show>
            <p class="passage">{cited()!.text}</p>
          </article>
        )}
      </Show>
      <Show when={forbidden()}>
        <p class="document-note">
          Your account can read the passages an answer cites. For the whole document, use the download above.
        </p>
      </Show>
      <Show when={chunks.error && !forbidden()}>
        <div class="notice" role="alert">
          {errorText(chunks.error)} <button type="button" class="link-button" onClick={() => void refetchChunks()}>{t('en', 'tryAgain')}</button>
        </div>
      </Show>
      <Show when={chunks()}>
        {(page) => (
          <>
            <For
              each={groups()}
              fallback={<p class="muted document-note">No text has been extracted from this edition yet.</p>}
            >
              {(group) => (
                <section class="document-page" id={group.key.startsWith('p') ? `page-${group.key.slice(1)}` : undefined} tabIndex={-1}>
                  <h2>{group.title}</h2>
                  <For each={group.items}>
                    {(c) => (
                      <article
                        class="document-passage"
                        classList={{ 'is-cited': c.id === citedId() }}
                        id={`passage-${c.id}`}
                        tabIndex={c.id === citedId() ? -1 : undefined}
                        aria-label={c.id === citedId() ? 'Cited passage' : undefined}
                      >
                        <Show when={c.locator.section && c.locator.page !== null}>
                          <p class="document-locator">{c.locator.section}</p>
                        </Show>
                        <p class="passage">{c.text}</p>
                      </article>
                    )}
                  </For>
                </section>
              )}
            </For>
            <Pagination cursor={cursor()} next={page().next_cursor} change={setCursor} label="Document pages" />
          </>
        )}
      </Show>
    </section>
  );
}
