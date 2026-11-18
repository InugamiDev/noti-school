import { createSignal, createUniqueId, For, Show } from 'solid-js';
import { Ban, ExternalLink, FileUp, Info, RefreshCw } from 'lucide-solid';
import { InstitutionDomains, Schemas, WebDocumentAction } from '@noti/contracts';
import type { z } from 'zod';
import { get, request, errorText, safeLink } from './api';
import { createRemoteResource as createResource } from './resource';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
import { LoadingStatus } from './ui/Loader';
import { ConfidenceDetails } from './ui/Confidence';
import { formatDate, type Lang } from './ui/format';
import { t, type StringKey } from './ui/i18n';

// intent: administrators see the web pages cached for their collection and decide what happens to
// each: promote it into the normal review flow, fetch it again, or block it. Nothing here approves a
// page; a promoted page becomes a document that still waits for review.
// status: done | next: none | confidence: medium (driven by the frozen contract and the demo server;
// the Rust endpoints are built in parallel)
type WebDocument = z.infer<typeof Schemas.WebDocument>;
type Institution = z.infer<typeof Schemas.Institution>;
type Action = z.infer<typeof WebDocumentAction>['action'];
/** The collection page's shared runner: one action at a time, with the outcome announced. */
type Act = (work: () => Promise<unknown>, done?: string) => Promise<void>;

const stateWords: Record<WebDocument['state'], { key: StringKey; tone: string }> = {
  fresh: { key: 'stateFresh', tone: 'sage' },
  stale: { key: 'stateStale', tone: 'butter' },
  failed: { key: 'stateFailed', tone: 'warm' },
};
const doneKey: Record<Action, StringKey> = { promote: 'promoteDone', refresh: 'refreshDone', block: 'blockDone' };

export function WebPages(props: {
  institution: string;
  lang: Lang;
  busy: boolean;
  act: Act;
  /** A promoted page became a document waiting for review; the document picker should show it. */
  promoted: () => unknown;
}) {
  const [cursor, setCursor] = createSignal('');
  const [confirming, setConfirming] = createSignal('');
  const [pages, { refetch }] = createResource(
    () => (props.institution ? { id: props.institution, cursor: cursor() } : false),
    async (key) => {
      const page = await get(scoped(key.id, '/web-documents') + pageSuffix(key.cursor), 'WebDocumentPage');
      if (page.items.some((doc) => doc.institution_id !== key.id)) throw new Error('Scope mismatch');
      return page;
    },
  );
  const run = (doc: WebDocument, action: Action) =>
    props.act(async () => {
      const result = await request(
        scoped(props.institution, '/web-documents/{web_document_id}', { web_document_id: doc.id }),
        Schemas.WebDocument,
        {
          method: 'PATCH',
          body: JSON.stringify(WebDocumentAction.parse({ action })),
          // One key per click: the server can recognise a repeated delivery; the page never retries.
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        },
      );
      if (result.id !== doc.id || result.institution_id !== props.institution) throw new Error('Scope mismatch');
      setConfirming('');
      await refetch();
      if (action === 'promote') await props.promoted();
    }, t(props.lang, doneKey[action]));
  return (
    <div class="web-pages" lang={props.lang}>
      <Show when={pages.loading && !pages()}>
        <LoadingStatus>{t(props.lang, 'webPagesLoading')}</LoadingStatus>
      </Show>
      <Show when={pages.error}>
        <p role="alert">{errorText(pages.error)}</p>
      </Show>
      <Show when={pages()}>
        {(page) => (
          <>
            <For each={page().items} fallback={<p class="muted admin-empty">{t(props.lang, 'webPagesEmpty')}</p>}>
              {(doc) => {
                const titleId = `web-page-${createUniqueId()}`;
                let keep: HTMLButtonElement | undefined;
                return (
                  <article class="admin-version web-page" aria-labelledby={titleId}>
                    <div class="admin-version-head">
                      <h3 id={titleId}>{doc.title}</h3>
                      <span class="admin-chip" data-tone={stateWords[doc.state].tone}>
                        {t(props.lang, stateWords[doc.state].key)}
                      </span>
                      <Show when={doc.source_id}>
                        <span class="admin-chip" data-tone="teal">{t(props.lang, 'promoted')}</span>
                      </Show>
                    </div>
                    <p class="muted">
                      <span class="origin-domain">{doc.domain}</span> · {t(props.lang, 'fetched')}{' '}
                      {formatDate(doc.fetched_at, props.lang)}
                    </p>
                    <div class="source-meta">
                      <ConfidenceDetails confidence={doc.confidence} lang={props.lang} />
                    </div>
                    <Show when={doc.state === 'stale'}>
                      <p class="admin-hint"><Info size={15} aria-hidden="true" />{t(props.lang, 'staleHint')}</p>
                    </Show>
                    <div class="actions">
                      <Show
                        when={doc.source_id}
                        fallback={
                          <button class="admin-primary" disabled={props.busy} aria-describedby={titleId} onClick={() => void run(doc, 'promote')}>
                            <FileUp size={16} aria-hidden="true" />{t(props.lang, 'promote')}
                          </button>
                        }
                      >
                        {(sourceId) => <a class="admin-link" href={`#/sources/${sourceId()}`}>{t(props.lang, 'viewDocument')}</a>}
                      </Show>
                      <button disabled={props.busy} aria-describedby={titleId} onClick={() => void run(doc, 'refresh')}>
                        <RefreshCw size={16} aria-hidden="true" />{t(props.lang, 'refresh')}
                      </button>
                      <button
                        class="danger"
                        disabled={props.busy}
                        aria-describedby={titleId}
                        aria-expanded={confirming() === doc.id}
                        onClick={() => {
                          setConfirming(doc.id);
                          queueMicrotask(() => keep?.focus());
                        }}
                      >
                        <Ban size={16} aria-hidden="true" />{t(props.lang, 'block')}
                      </button>
                      <Show when={safeLink(doc.final_url)}>
                        {(url) => (
                          <a class="admin-link" href={url()} target="_blank" rel="noopener noreferrer">
                            {t(props.lang, 'openPage')} <ExternalLink size={15} aria-hidden="true" />
                          </a>
                        )}
                      </Show>
                    </div>
                    {/* Blocking removes evidence from answers, so it asks first; the safe choice has focus. */}
                    <Show when={confirming() === doc.id}>
                      <div class="confirm-row" role="group" aria-label={t(props.lang, 'blockConfirmLabel')}>
                        <p>{t(props.lang, 'blockConfirm')}</p>
                        <div class="actions">
                          <button class="danger" disabled={props.busy} onClick={() => void run(doc, 'block')}>
                            <Ban size={16} aria-hidden="true" />{t(props.lang, 'blockPage')}
                          </button>
                          <button type="button" ref={keep} disabled={props.busy} onClick={() => setConfirming('')}>
                            {t(props.lang, 'keep')}
                          </button>
                        </div>
                      </div>
                    </Show>
                  </article>
                );
              }}
            </For>
            <Pagination cursor={cursor()} next={page().next_cursor} change={setCursor} label={t(props.lang, 'webPagesNav')} />
          </>
        )}
      </Show>
    </div>
  );
}

// One or more dot-separated labels and a top-level name: a host, never a URL, path or wildcard.
const hostname = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The school's own domains. The server stays the authority; this only refuses obvious non-hosts. */
export function DomainsEditor(props: {
  institution: string;
  domains: readonly string[];
  lang: Lang;
  busy: boolean;
  act: Act;
  saved: (next: Institution) => void;
}) {
  const [error, setError] = createSignal('');
  const errorId = `domains-error-${createUniqueId()}`;
  return (
    <form
      class="stack admin-form"
      lang={props.lang}
      onSubmit={(e) => {
        e.preventDefault();
        const typed = String(new FormData(e.currentTarget).get('domains') ?? '');
        const domains = [...new Set(typed.split(/[\s,]+/).map((d) => d.toLowerCase()).filter(Boolean))];
        const parsed = InstitutionDomains.safeParse({ domains });
        if (!parsed.success || domains.some((d) => !hostname.test(d))) {
          setError(t(props.lang, 'domainsInvalid'));
          return;
        }
        setError('');
        void props.act(async () => {
          const next = await request(scoped(props.institution, '/domains'), Schemas.Institution, {
            method: 'PUT',
            body: JSON.stringify(parsed.data),
          });
          if (next.id !== props.institution) throw new Error('Scope mismatch');
          props.saved(next);
        }, t(props.lang, 'domainsSaved'));
      }}
    >
      <label>
        {t(props.lang, 'domainsLabel')}
        <textarea
          name="domains"
          rows={4}
          spellcheck={false}
          autocapitalize="off"
          value={props.domains.join('\n')}
          aria-invalid={error() ? 'true' : undefined}
          aria-describedby={error() ? errorId : undefined}
        />
      </label>
      <Show when={error()}>
        <p id={errorId} role="alert" class="error">{error()}</p>
      </Show>
      <button class="admin-primary" disabled={props.busy}>{t(props.lang, 'saveDomains')}</button>
    </form>
  );
}
