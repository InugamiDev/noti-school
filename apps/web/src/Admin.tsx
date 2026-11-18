import { createEffect, createSignal, For, Show, on, onCleanup } from 'solid-js';
import { Check, ChevronDown, FilePlus, FolderOpen, Globe, Info, MessageSquareWarning, Network, Plus, RefreshCw, ShieldAlert, Upload, Wallet } from 'lucide-solid';
import type { z } from 'zod';
import { LoadingStatus, SkeletonLines, SkeletonList } from './ui/Loader';
import { Select } from './ui/Select';
import { enter } from './ui/motion';
import { formatDate, type Lang } from './ui/format';
import { t } from './ui/i18n';
import { ConfidenceDetails, ConfidenceTag } from './ui/Confidence';
import { FetchedDate, OriginTag } from './ui/Origin';
import { DomainsEditor, WebPages } from './WebPages';
import { createRemoteResource as createResource } from './resource';
import { SourceCreate, VersionCreate, VersionAction, GraphEntityCreate, GraphEdgeCreate, GraphEdgeAction } from '@noti/contracts';
import { get, post, request, errorText, readAnswer, safeLink } from './api';
import { Schemas } from '@noti/contracts';
import { scoped } from './App';
import { documentHref } from './Sources';
import Pagination, { pageSuffix } from './Pagination';
import './ui/admin.css';

const categoryLabel: Record<string, string> = {
  unsupported: 'Unsupported claim',
  incorrect: 'Incorrect',
  outdated: 'Outdated',
  other: 'Other',
};
const feedbackStatus: Record<string, { label: string; tone: string }> = {
  open: { label: 'New', tone: 'warm' },
  reviewed: { label: 'Reviewed', tone: 'teal' },
  resolved: { label: 'Resolved', tone: 'sage' },
};
const versionStatus: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'plain' },
  quarantined: { label: 'Quarantined', tone: 'warm' },
  pending_review: { label: 'Waiting for review', tone: 'butter' },
  approved: { label: 'Approved', tone: 'sage' },
  archived: { label: 'Archived', tone: 'plain' },
  failed: { label: 'Failed', tone: 'warm' },
};
const indexingLabel: Record<string, string> = {
  pending: 'pending',
  running: 'in progress',
  ready: 'ready',
  failed: 'failed',
  disabled: 'off',
};
const steps = ['Details', 'Upload or fetch', 'Review & approve'] as const;
const jobWords: Record<string, string> = {
  queued: 'Waiting to start. This page checks again automatically.',
  running: 'Indexing in progress. This page checks again automatically.',
  succeeded: 'Indexing finished.',
  failed: 'Indexing failed. Retry indexing below or inspect the file.',
};
const actionDone: Record<string, string> = {
  approve: 'Approval requested. The version can be cited once its indexing is ready.',
  archive: 'Archive requested. This version will no longer feed new answers.',
  retry_index: 'Indexing retry requested. Watch the indexing status above.',
};
const usd = (micro: number) => `$${(micro / 1e6).toFixed(2)}`;
const monthName = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? month
    : new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
};

export default function Admin(props: {
  institution: string;
  allowed: boolean;
  signedIn: boolean;
  /** Language for the web pages and domains sections; the older sections are English only. */
  lang: Lang;
  /** The selected institution's own domains, as last read. */
  domains: readonly string[];
  institutionUpdated: (next: z.infer<typeof Schemas.Institution>) => void;
}) {
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const [selected, setSelected] = createSignal(''),
    [message, setMessage] = createSignal(''),
    [busy, setBusy] = createSignal(false),
    [jobId, setJobId] = createSignal('');
  const [sourceCursor,setSourceCursor]=createSignal(''),[versionCursor,setVersionCursor]=createSignal(''),[feedbackCursor,setFeedbackCursor]=createSignal('');
  const [graphCursor, setGraphCursor] = createSignal(''), [entityId, setEntityId] = createSignal('');
  const [reviewVersion, setReviewVersion] = createSignal(''), [chunkCursor, setChunkCursor] = createSignal('');
  const [reportId, setReportId] = createSignal('');
  // The source just created may sit on another page of the picker, so its kind and title are kept here.
  const [created, setCreated] = createSignal<{ id: string; kind: string; title: string } | null>(null);
  const [draftKind, setDraftKind] = createSignal('pdf');
  const [chunks] = createResource(
    () => props.allowed && reviewVersion() ? { institution: props.institution, version: reviewVersion(), cursor: chunkCursor() } : false,
    async key => {
      const page = await get(scoped(key.institution, '/versions/{version_id}/chunks', { version_id: key.version }) + pageSuffix(key.cursor), 'ChunkPage');
      if (page.items.some(c => c.institution_id !== key.institution || c.version_id !== key.version)) throw new Error('Scope mismatch');
      return page;
    },
  );
  const [context, { refetch: refreshContext }] = createResource(
    () => props.allowed && reportId() ? { institution: props.institution, report: reportId() } : false,
    async key => {
      const value = await get(scoped(key.institution, '/feedback/{feedback_id}/context', { feedback_id: key.report }), 'FeedbackContext');
      const answer = readAnswer(value.answer);
      if (value.feedback.id !== key.report || value.feedback.institution_id !== key.institution || answer.institution_id !== key.institution || value.feedback.answer_id !== answer.id) throw new Error('Scope mismatch');
      return { ...value, answer };
    },
  );
  const [graph, { refetch: refreshGraph }] = createResource(
    () => props.allowed && props.institution ? { id: props.institution, cursor: graphCursor() } : false,
    key => get(scoped(key.id, '/graph') + pageSuffix(key.cursor), 'GraphEdgePage'),
  );
  const [sources, { refetch: refreshSources }] = createResource(
    () => props.allowed && props.institution ? {id:props.institution,cursor:sourceCursor()} : false,
    (key) => get(scoped(key.id, '/sources')+pageSuffix(key.cursor), 'SourcePage'),
  );
  const current = () => {
    const listed = sources()?.items.find(s => s.id === selected());
    if (listed) return { id: listed.id, kind: listed.kind as string, title: listed.title };
    const fresh = created();
    return fresh && fresh.id === selected() ? fresh : undefined;
  };
  const urlSource = () => current()?.kind === 'url';
  // An empty collection leads with "Add document"; the picker has nothing to pick yet.
  const emptyCollection = () => !!sources() && sources()!.items.length === 0 && !created();
  const [versions, { refetch: refreshVersions }] = createResource(
    () => (props.allowed && selected() ? {id:selected(),cursor:versionCursor()} : false),
    (key) =>
      get(
        scoped(props.institution, '/sources/{source_id}/versions', { source_id: key.id })+pageSuffix(key.cursor),
        'VersionPage',
      ),
  );
  const [budget] = createResource(
    () => props.allowed && props.institution,
    (id) => get(scoped(id, '/budget'), 'Budget'),
  );
  const [feedback, { refetch: refreshFeedback }] = createResource(
    () => props.allowed && props.institution ? {id:props.institution,cursor:feedbackCursor()} : false,
    (key) => get(scoped(key.id, '/feedback')+pageSuffix(key.cursor), 'FeedbackPage'),
  );
  const [job, { refetch: refreshJob }] = createResource(
    () => (props.allowed && jobId() ? jobId() : false),
    (id) => get(scoped(props.institution, '/jobs/{job_id}', { job_id: id }), 'Job'),
  );
  // Step 3 opens once the selected document has a version to review or an upload was just accepted.
  const step = () => (!selected() ? 1 : jobId() || (versions()?.items.length ?? 0) > 0 ? 3 : 2);
  const pickSource = (value: string) => {
    setSelected(value); setVersionCursor(''); setReviewVersion(''); setChunkCursor(''); setJobId('');
  };
  let flow: HTMLDivElement | undefined;
  let reviewTitle: HTMLHeadingElement | undefined;
  createEffect(on(step, () => {
    const panel = flow?.querySelector('[data-step-panel="current"]');
    if (panel) enter(panel, { opacity: [0, 1], y: [8, 0] });
  }, { defer: true }));
  // Jobs that are still queued or running are re-read every two seconds, bounded to a minute.
  let polls = 0;
  createEffect(on(jobId, () => { polls = 0; }));
  createEffect(on(job, (current) => {
    if (!current || !['queued', 'running'].includes(current.state) || polls >= 30) return;
    const timer = setTimeout(() => { polls++; void refreshJob(); }, 2000);
    onCleanup(() => clearTimeout(timer));
  }));
  let messageLine: HTMLParagraphElement | undefined;
  async function act(work: () => Promise<unknown>, done = 'Action accepted. Check the updated status below.') {
    if (busy()) return;
    setBusy(true);
    setMessage('');
    try {
      await work();
      if (!disposed) setMessage(done);
    } catch (e) {
      if (!disposed) setMessage(errorText(e));
    } finally {
      if (!disposed) setBusy(false);
      // Re-rendered lists drop focus to the page; land it on the outcome instead.
      queueMicrotask(() => {
        if (!disposed && document.activeElement === document.body) messageLine?.focus();
      });
    }
  }
  const stepState = (n: number) => (n < step() ? 'done' : n === step() ? 'current' : 'upcoming');
  return (
    <div class="admin-page">
      <div class="admin-head">
        <h1 tabIndex={-1}>Collection management</h1>
        <p class="muted">Add official documents, review what was extracted, and answer reports from students.</p>
      </div>
      <Show
        when={props.allowed}
        fallback={
          <section class="admin-card admin-gate stagger-in" aria-labelledby="admin-gate-title">
            <span class="admin-icon" aria-hidden="true"><ShieldAlert size={18} /></span>
            <div>
              <h2 id="admin-gate-title">Admins only</h2>
              <p class="muted">
                {props.signedIn
                  ? 'Your account is not an administrator of this institution. Ask your institution for an administrator invitation, or switch to an admin account.'
                  : 'Sign in with an administrator membership to manage this collection.'}
              </p>
              <div class="actions">
                <a class="admin-primary admin-gate-link" href="#/auth">{props.signedIn ? 'Switch account' : 'Sign in'}</a>
                <a class="admin-link" href="#/sources">Browse sources instead</a>
              </div>
            </div>
          </section>
        }
      >
        <div class="admin-layout">
          <div class="admin-col">
            <section class="admin-card admin-picker stagger-in" style={{ '--i': 0 }} aria-labelledby="admin-existing" classList={{ 'admin-after-flow': emptyCollection() }}>
              <div class="admin-card-head">
                <span class="admin-icon" aria-hidden="true"><FolderOpen size={18} /></span>
                <div>
                  <h2 id="admin-existing">Existing documents</h2>
                  <p class="muted">Pick a document to upload a new version or review its versions.</p>
                </div>
              </div>
              <Select
                label="Select source"
                placeholder="Choose a source"
                value={selected()}
                onChange={pickSource}
                options={[{ value: '', label: 'Choose a source' }, ...(sources()?.items ?? []).map((s) => ({ value: s.id, label: s.title }))]}
              />
              <Pagination cursor={sourceCursor()} next={sources()?.next_cursor} change={setSourceCursor} label="Source pages"/>
              <Show when={selected()}>
                <a class="text-link admin-link" href={`#/sources/${selected()}`}>
                  Read source & versions
                </a>
              </Show>
            </section>

            <section class="admin-card admin-flow stagger-in" style={{ '--i': 1 }} aria-labelledby="admin-flow-title" ref={flow}>
              <div class="admin-card-head">
                <span class="admin-icon" aria-hidden="true"><FilePlus size={18} /></span>
                <div>
                  <h2 id="admin-flow-title">{selected() ? current()?.title ?? 'Selected document' : 'Add document'}</h2>
                  <p class="muted">New versions stay out of answers until you read the passages and approve them.</p>
                </div>
              </div>
              <ol class="admin-steps" aria-label="Progress">
                <For each={steps}>
                  {(name, i) => (
                    <li data-state={stepState(i() + 1)} aria-current={stepState(i() + 1) === 'current' ? 'step' : undefined}>
                      <span class="admin-step-dot" aria-hidden="true">
                        <Show when={stepState(i() + 1) === 'done'} fallback={i() + 1}><Check size={14} /></Show>
                      </span>
                      <span class="admin-step-name"><span class="sr-only">Step {i() + 1}: </span>{name}</span>
                    </li>
                  )}
                </For>
              </ol>

              <Show
                when={selected()}
                fallback={
                  <div class="admin-step-panel" data-step-panel="current">
                    <form
                      class="stack admin-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        void act(async () => {
                          const kind = String(data.get('kind'));
                          const body = SourceCreate.parse({
                            title: data.get('title'),
                            kind,
                            visibility: data.get('visibility'),
                            ...(kind === 'url' ? { original_url: data.get('url') } : {}),
                          });
                          const result = await post(scoped(props.institution, '/sources'), 'Source', body);
                          setCreated({ id: result.id, kind: result.kind, title: result.title });
                          pickSource(result.id);
                          // Step 2 is ready: put the cursor in its first field instead of dropping focus.
                          queueMicrotask(() => flow?.querySelector<HTMLInputElement>('input[name="label"]')?.focus());
                          await refreshSources();
                        }, `“${String(data.get('title'))}” created. Now ${String(data.get('kind')) === 'url' ? 'fetch its saved URL' : 'upload its first version'}.`);
                      }}
                    >
                      <label>
                        Document title
                        <input name="title" required maxLength={300} />
                      </label>
                      <div class="form-row">
                        <Select
                          label="Format"
                          name="kind"
                          onChange={setDraftKind}
                          options={[
                            { value: 'pdf', label: 'PDF' },
                            { value: 'text', label: 'Text' },
                            { value: 'url', label: 'Official URL' },
                          ]}
                        />
                        <Select
                          label="Visibility"
                          name="visibility"
                          options={[
                            { value: 'institution', label: 'Institution' },
                            { value: 'admin', label: 'Administrators' },
                          ]}
                        />
                      </div>
                      <Show when={draftKind() === 'url'}>
                        <label>
                          Original URL (for URL sources)
                          <input name="url" type="url" placeholder="https://" required />
                        </label>
                      </Show>
                      <p class="admin-hint"><Info size={15} aria-hidden="true" />Next you will {draftKind() === 'url' ? 'fetch the page from this URL' : 'upload the file'}, then review and approve it.</p>
                      <button class="admin-primary" disabled={busy()}>Create source</button>
                    </form>
                  </div>
                }
              >
                <div class="admin-step-panel" data-step-panel={step() === 2 ? 'current' : undefined}>
                  <form
                    class="stack admin-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void act(async () => {
                        const file = data.get('file');
                        if (!urlSource() && (
                          !(file instanceof File) ||
                          !file.size ||
                          file.size > 20 * 1024 * 1024 ||
                          !['application/pdf', 'text/plain'].includes(file.type)
                        ))
                          throw new Error('Invalid file');
                        const metadata = VersionCreate.parse({
                          label: data.get('label'),
                          language: data.get('language'),
                          effective_from: data.get('from')
                            ? new Date(String(data.get('from'))).toISOString()
                            : null,
                          effective_until: data.get('until')
                            ? new Date(String(data.get('until'))).toISOString()
                            : null,
                        });
                        const body = new FormData();
                        body.set('metadata', JSON.stringify(metadata));
                        if (file instanceof File) body.set('file', file);
                        const result = await post(
                          scoped(props.institution, urlSource() ? '/sources/{source_id}/fetch' : '/sources/{source_id}/versions', {
                            source_id: selected(),
                          }),
                          'Job',
                          urlSource() ? metadata : body,
                          { headers: { 'Idempotency-Key': crypto.randomUUID() } },
                        );
                        setJobId(result.id);
                        await refreshVersions();
                        queueMicrotask(() => reviewTitle?.focus());
                      }, urlSource()
                        ? 'Fetch requested. Read the extracted passages below, then approve.'
                        : 'Version uploaded. Read the extracted passages below, then approve.');
                    }}
                  >
                    <h3 class="admin-step-title">
                      <span class="admin-icon sm" aria-hidden="true">{urlSource() ? <Globe size={16} /> : <Upload size={16} />}</span>
                      {urlSource() ? 'Fetch a saved URL' : 'Upload a version'}
                    </h3>
                    <div class="form-row">
                      <label>
                        Version label
                        <input name="label" maxLength={100} required placeholder="e.g. 2026 edition" />
                      </label>
                      <Select label="Document language" name="language" options={[{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }]} />
                    </div>
                    <Show when={!urlSource()}><label class="admin-file">
                      PDF or UTF-8 text · up to 20 MiB
                      <input name="file" type="file" accept="application/pdf,text/plain" required />
                    </label></Show>
                    <Show when={urlSource()}><p class="notice admin-notice">Fetch only this source’s saved URL. Fetched content requires review and is not approved evidence.</p></Show>
                    <div class="form-row">
                      <label>
                        Effective from
                        <input name="from" type="datetime-local" />
                      </label>
                      <label>
                        Effective until
                        <input name="until" type="datetime-local" />
                      </label>
                    </div>
                    <div class="admin-form-actions">
                      <button class="admin-primary" disabled={busy()}>{urlSource() ? 'Fetch saved URL' : 'Upload version'}</button>
                      <button type="button" class="admin-quiet" disabled={busy()} onClick={() => pickSource('')}><Plus size={16} aria-hidden="true" />Add another document</button>
                    </div>
                  </form>
                </div>

                <div class="admin-step-panel admin-review" data-step-panel={step() === 3 ? 'current' : undefined}>
                  <h3 class="admin-step-title" ref={reviewTitle} tabIndex={-1}>
                    <span class="admin-icon sm" aria-hidden="true"><Check size={16} /></span>
                    Review & approve
                  </h3>
                  <Show when={jobId()}>
                    <div class="admin-job" role="status">
                      <h4>Indexing status</h4>
                      <p class="admin-job-line">
                        <span class="admin-chip" data-tone={job()?.state === 'failed' ? 'warm' : job()?.state === 'succeeded' ? 'sage' : 'teal'}>{job()?.state || 'Loading…'}</span>
                        <Show when={job()?.error_code}><span class="error">{job()?.error_code}</span></Show>
                        <Show when={job()}>{(j) => <span class="muted admin-job-words">{jobWords[j().state] ?? ''}</span>}</Show>
                      </p>
                      <button class="admin-quiet" onClick={() => void refreshJob()}><RefreshCw size={15} aria-hidden="true" />Check now</button>
                    </div>
                  </Show>
                  <Show when={versions.loading && !versions()}><SkeletonLines lines={2} /></Show>
                  <For each={versions()?.items} fallback={<Show when={!versions.loading}><p class="muted">No versions yet. Upload a file or fetch the URL above.</p></Show>}>
                    {(v) => (
                      <article class="admin-version" classList={{ 'is-new': !!job() && job()?.version_id === v.id }}>
                        <div class="admin-version-head">
                          <h4>{v.label}</h4>
                          <span class="admin-chip" data-tone={versionStatus[v.status]?.tone ?? 'plain'}>{versionStatus[v.status]?.label ?? v.status}</span>
                          <Show when={job()?.version_id === v.id}><span class="admin-chip" data-tone="teal">Just uploaded</span></Show>
                        </div>
                        <p class="muted">
                          Indexing {indexingLabel[v.indexing] ?? v.indexing} · Added {formatDate(v.created_at)}
                          <Show when={v.effective_from || v.effective_until}>
                            {' '}· In effect {v.effective_from ? formatDate(v.effective_from) : '…'} – {v.effective_until ? formatDate(v.effective_until) : '…'}
                          </Show>
                        </p>
                        <Show when={v.status === 'pending_review'}>
                          <p class="admin-hint"><Info size={15} aria-hidden="true" />Read the extracted passages, then approve to let answers cite this version.</p>
                        </Show>
                        <div class="actions">
                          <button aria-pressed={reviewVersion() === v.id} onClick={() => { setReviewVersion(v.id); setChunkCursor(''); }}>Review passages</button>
                          <For each={['approve', 'archive', 'retry_index'] as const}>
                            {(action) => (
                              <button
                                class={action === 'approve' ? 'admin-primary' : undefined}
                                disabled={busy()}
                                onClick={() =>
                                  void act(async () => {
                                    const body = VersionAction.parse({
                                      action,
                                      expected_status: v.status,
                                    });
                                    const result = await post(
                                      scoped(props.institution, '/versions/{version_id}/actions', {
                                        version_id: v.id,
                                      }),
                                      'Job',
                                      body,
                                      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
                                    );
                                    setJobId(result.id);
                                    await refreshVersions();
                                  }, actionDone[action])
                                }
                              >
                                {action === 'retry_index'
                                  ? 'Retry indexing'
                                  : action === 'approve'
                                    ? 'Approve'
                                    : 'Archive'}
                              </button>
                            )}
                          </For>
                        </div>
                      </article>
                    )}
                  </For>
                  <Pagination cursor={versionCursor()} next={versions()?.next_cursor} change={setVersionCursor} label="Version pages"/>
                </div>
              </Show>
            </section>

            <Show when={reviewVersion()}>
              <section class="admin-card reader" aria-label="Extracted passages">
                <h3>Extracted passages</h3>
                <p class="muted">Read each page before deciding whether to approve this version. Opening this view does not mark it reviewed.</p>
                <Show when={current()}>{(c) => <a class="admin-link" href={documentHref(c().id, reviewVersion())}>Open this version in the document reader</a>}</Show>
                <Show when={chunks.loading}><LoadingStatus>Loading passages…</LoadingStatus><SkeletonLines lines={4} /></Show>
                <Show when={chunks.error}><p role="alert">{errorText(chunks.error)}</p></Show>
                <Show when={chunks()}>{page => <>
                  <For each={page().items} fallback={<p>No extracted text on this page. Inspect the original file; extraction may need attention.</p>}>{chunk => <article class="admin-passage">
                    <h4>Passage {chunk.ordinal + 1}</h4>
                    <p class="muted">{chunk.locator.page ? `Page ${chunk.locator.page}` : 'Page not supplied'}{chunk.locator.section ? ` · ${chunk.locator.section}` : ''}</p>
                    <p class="passage">{chunk.text}</p>
                    <div class="admin-ids">
                      <label class="stack">Evidence chunk ID<input readonly value={chunk.id} onFocus={e => e.currentTarget.select()}/></label>
                      <label class="stack">Version ID<input readonly value={chunk.version_id}/></label>
                      <label class="stack">Source ID<input readonly value={chunk.source_id}/></label>
                    </div>
                  </article>}</For>
                  <Pagination cursor={chunkCursor()} next={page().next_cursor} change={setChunkCursor} label="Passage pages"/>
                </>}</Show>
              </section>
            </Show>
          </div>

          <div class="admin-col">
            <section class="admin-card stagger-in" style={{ '--i': 1 }} aria-labelledby="admin-budget">
              <div class="admin-card-head">
                <span class="admin-icon" aria-hidden="true"><Wallet size={18} /></span>
                <div><h2 id="admin-budget">Monthly AI budget</h2></div>
              </div>
              <Show when={budget()} fallback={<p class="muted">Budget unavailable.</p>}>
                {(b) => {
                  const used = () => b().spent_micro_usd + b().reserved_micro_usd;
                  const share = (micro: number) => (b().cap_micro_usd > 0 ? Math.min(100, (micro / b().cap_micro_usd) * 100) : 0);
                  return (
                    <>
                      <p class="admin-budget-total">{usd(used())} of {usd(b().cap_micro_usd)} this month</p>
                      <div
                        class="admin-meter"
                        role="meter"
                        aria-label="AI budget used, including reserved"
                        aria-valuemin={0}
                        aria-valuemax={b().cap_micro_usd / 1e6}
                        aria-valuenow={Math.min(used(), b().cap_micro_usd) / 1e6}
                        aria-valuetext={`${usd(used())} of ${usd(b().cap_micro_usd)}`}
                      >
                        <span class="admin-meter-spent" style={{ width: `${share(b().spent_micro_usd)}%` }} />
                        <span class="admin-meter-reserved" style={{ width: `${Math.max(0, share(used()) - share(b().spent_micro_usd))}%` }} />
                      </div>
                      <dl class="admin-budget">
                        <dt>Month</dt>
                        <dd>{monthName(b().month)}</dd>
                        <dt><i class="admin-swatch spent" aria-hidden="true" />Spent</dt>
                        <dd>{usd(b().spent_micro_usd)}</dd>
                        <dt><i class="admin-swatch reserved" aria-hidden="true" />Reserved</dt>
                        <dd>{usd(b().reserved_micro_usd)}</dd>
                        <dt>Application ceiling</dt>
                        <dd>{usd(b().cap_micro_usd)}</dd>
                      </dl>
                      <p class="admin-hint"><Info size={15} aria-hidden="true" />Reserved is money held for answers still being generated; whatever they do not use is released.</p>
                    </>
                  );
                }}
              </Show>
            </section>

            <section class="admin-card stagger-in" style={{ '--i': 2 }} aria-labelledby="admin-feedback">
              <div class="admin-card-head">
                <span class="admin-icon" aria-hidden="true"><MessageSquareWarning size={18} /></span>
                <div><h2 id="admin-feedback">Feedback</h2></div>
              </div>
              <For each={feedback()?.items} fallback={<p class="muted admin-empty">No feedback loaded.</p>}>
                {(f) => {
                  const locked = () => reportId() !== f.id || !context() || context.loading || !!context.error;
                  return (
                    <article class="admin-report">
                      <div class="admin-version-head">
                        <h3>{categoryLabel[f.category] ?? f.category}</h3>
                        <span class="admin-chip" data-tone={feedbackStatus[f.status]?.tone ?? 'plain'}>{feedbackStatus[f.status]?.label ?? f.status}</span>
                      </div>
                      <p class="muted admin-date">Reported {formatDate(f.created_at)}</p>
                      <Show when={f.comment}><p class="admin-comment">{f.comment}</p></Show>
                      <button class="admin-quiet" onClick={() => reportId() === f.id ? void refreshContext() : setReportId(f.id)}>Review report context</button>
                      <Show when={reportId() === f.id}>
                        <Show when={context.loading}><LoadingStatus>Loading report context…</LoadingStatus></Show>
                        <Show when={context.error}><p role="alert">Report context unavailable. Review status has not been changed. {errorText(context.error)}</p></Show>
                        <Show when={context()}>{c => <section class="reader admin-context" aria-label="Report context">
                          <h4>Reported question</h4><p class="passage admin-quote">{c().question}</p>
                          <h4>Reported answer <span class="admin-chip" data-tone="plain">{c().answer.status}</span></h4>
                          <For each={c().answer.claims}>{claim => <p class="passage admin-claim" classList={{ 'is-flagged': !!f.evidence_id && claim.evidence_ids.includes(f.evidence_id) }}>{claim.text}</p>}</For>
                          <Show when={c().answer.explanation}><p class="notice admin-notice">{c().answer.explanation}</p></Show>
                          <h4>Current citations</h4>
                          <For each={c().answer.evidence} fallback={<p>No citations currently accessible.</p>}>{evidence => <article class="admin-citation" classList={{ 'is-flagged': evidence.id === f.evidence_id }}>
                            <h4>{evidence.title} · {evidence.version_label}</h4>
                            <Show when={evidence.id === f.evidence_id}><span class="admin-chip" data-tone="warm">Citation in this report</span></Show>
                            <p class="muted">{evidence.locator.page ? `Page ${evidence.locator.page}` : ''}{evidence.locator.section ? ` · ${evidence.locator.section}` : ''}</p>
                            <div class="source-meta">
                              <OriginTag origin={evidence.origin} domain={evidence.domain} lang={props.lang} />
                              <Show when={evidence.origin === 'web'}><FetchedDate at={evidence.retrieved_at} lang={props.lang} /></Show>
                              <ConfidenceDetails confidence={evidence.confidence} lang={props.lang} />
                            </div>
                            <blockquote>{evidence.quote}</blockquote>
                            <div class="actions">
                              {/* A web page has no library edition to open; only its own address is offered. */}
                              <Show when={evidence.origin !== 'web'}><a class="admin-link" href={documentHref(evidence.source_id, evidence.version_id, { page: evidence.locator.page, chunk: evidence.chunk_id })}>Open cited passage in the document</a></Show>
                              <Show when={safeLink(evidence.original_url)}>{url => <a href={url()} target="_blank" rel="noopener noreferrer">Original website</a>}</Show>
                            </div>
                            <label class="stack">Citation ID<input readonly value={evidence.id}/></label>
                          </article>}</For>
                        </section>}</Show>
                      </Show>
                      <div class="actions">
                        <For each={['reviewed', 'resolved'] as const}>
                          {(status) => (
                            <button
                              disabled={busy() || locked()}
                              onClick={() =>
                                void act(async () => {
                                  await request(
                                    scoped(props.institution, '/feedback/{feedback_id}', {
                                      feedback_id: f.id,
                                    }),
                                    Schemas.Feedback,
                                    { method: 'PATCH', body: JSON.stringify({ status }) },
                                  );
                                  await refreshFeedback();
                                }, status === 'resolved' ? 'Report marked resolved.' : 'Report marked reviewed. Mark it resolved once the source or answer is fixed.')
                              }
                            >
                              Mark {status}
                            </button>
                          )}
                        </For>
                      </div>
                      <Show when={locked() && !(reportId() === f.id && (context.loading || context.error))}>
                        <p class="admin-hint"><Info size={15} aria-hidden="true" />Open the report context to review it before changing its status.</p>
                      </Show>
                    </article>
                  );
                }}
              </For>
              <Pagination cursor={feedbackCursor()} next={feedback()?.next_cursor} change={setFeedbackCursor} label="Feedback pages"/>
            </section>
          </div>
        </div>

        <section class="admin-card admin-web stagger-in" style={{ '--i': 3 }} aria-labelledby="admin-web" lang={props.lang}>
          <div class="admin-card-head">
            <span class="admin-icon" aria-hidden="true"><Globe size={18} /></span>
            <div>
              <h2 id="admin-web">{t(props.lang, 'webPages')}</h2>
              <p class="muted">{t(props.lang, 'webPagesAbout')}</p>
            </div>
          </div>
          <div class="admin-web-layout">
            <WebPages institution={props.institution} lang={props.lang} busy={busy()} act={act} promoted={refreshSources} />
            <div class="admin-domains">
              <h3>{t(props.lang, 'schoolDomains')}</h3>
              <p class="muted">{t(props.lang, 'schoolDomainsAbout')}</p>
              <DomainsEditor institution={props.institution} domains={props.domains} lang={props.lang} busy={busy()} act={act} saved={props.institutionUpdated} />
            </div>
          </div>
        </section>

        <details class="admin-card admin-disclosure stagger-in" style={{ '--i': 4 }}>
          <summary>
            <span class="admin-icon" aria-hidden="true"><Network size={18} /></span>
            <span class="admin-disclosure-text">
              <span class="admin-disclosure-title">Evidence graph administration</span>
              <span class="muted">Link entities with relations backed by a cited passage.</span>
            </span>
            <ChevronDown class="admin-disclosure-chevron" size={18} aria-hidden="true" />
          </summary>
          <div class="admin-disclosure-body">
            <p class="muted">Relations require a readable evidence chunk in this institution. Creating a candidate does not approve evidence or establish coverage.</p>
            <div class="admin-graph-forms">
              <form class="stack admin-form" onSubmit={e => {
                e.preventDefault(); const data = new FormData(e.currentTarget);
                void act(async () => {
                  const body = GraphEntityCreate.parse({ kind: data.get('kind'), label: data.get('label') });
                  const result = await post(scoped(props.institution, '/graph/entities'), 'GraphEntity', body);
                  setEntityId(result.id);
                });
              }}>
                <h3>New entity</h3>
                <Select label="Entity kind" name="kind" options={GraphEntityCreate.shape.kind.options.map((kind) => ({ value: kind, label: kind }))} />
                <label>Entity label<input name="label" required maxLength={300}/></label>
                <button disabled={busy()}>Create graph entity</button>
                <Show when={entityId()}><p class="admin-ids-line">Created entity ID: <code>{entityId()}</code></p></Show>
              </form>
              <form class="stack admin-form" onSubmit={e => {
                e.preventDefault(); const data = new FormData(e.currentTarget);
                void act(async () => {
                  const body = GraphEdgeCreate.parse({ from_entity_id: data.get('from'), to_entity_id: data.get('to'), relation: data.get('relation'), evidence_chunk_id: data.get('chunk') });
                  await post(scoped(props.institution, '/graph/edges'), 'GraphEdge', body); await refreshGraph();
                });
              }}>
                <h3>New relation</h3>
                <label>From entity ID<input name="from" required/></label>
                <label>To entity ID<input name="to" required/></label>
                <label>Relation<input name="relation" maxLength={100} required/></label>
                <label>Evidence chunk ID<input name="chunk" required/></label>
                <button disabled={busy()}>Create candidate relation</button>
              </form>
            </div>
            <Show when={graph.loading}><LoadingStatus>Loading graph relations…</LoadingStatus></Show>
            <Show when={graph.error}><p role="alert">{errorText(graph.error)}</p></Show>
            <Show when={graph()}>
              <For each={graph()?.items} fallback={<p class="muted">No graph relations returned for this institution.</p>}>{edge => <article class="admin-version">
                <div class="admin-version-head"><h4>{edge.relation}</h4><span class="admin-chip" data-tone={edge.status === 'approved' ? 'sage' : edge.status === 'rejected' ? 'warm' : 'butter'}>{edge.status}</span><ConfidenceTag value={edge.confidence} lang={props.lang} /></div>
                <p class="muted admin-ids-line">{edge.from_entity_id} → {edge.to_entity_id}</p>
                <For each={edge.evidence}>{evidence => <p class="admin-edge-evidence">
                  <Show
                    when={evidence.origin !== 'web'}
                    fallback={<Show when={safeLink(evidence.original_url)} fallback={<span>{evidence.title}</span>}>{url => <a class="admin-link" href={url()} target="_blank" rel="noopener noreferrer">{evidence.title}</a>}</Show>}
                  >
                    <a class="admin-link" href={`#/sources/${evidence.source_id}`}>{evidence.title} · {evidence.version_label} · {evidence.locator.page ? `Page ${evidence.locator.page}` : evidence.locator.section}</a>
                  </Show>
                  <OriginTag origin={evidence.origin} domain={evidence.domain} lang={props.lang} />
                </p>}</For>
                <div class="actions">
                  <For each={['approved', 'rejected'] as const}>{status => <button disabled={busy()} onClick={() => void act(async () => {
                    await request(scoped(props.institution, '/graph/edges/{edge_id}', { edge_id: edge.id }), Schemas.GraphEdge, { method: 'PATCH', body: JSON.stringify(GraphEdgeAction.parse({ status })) });
                    await refreshGraph();
                  })}>{status === 'approved' ? 'Approve relation' : 'Reject relation'}</button>}</For>
                </div>
              </article>}</For>
              <Pagination cursor={graphCursor()} next={graph()?.next_cursor} change={setGraphCursor} label="Graph pages"/>
            </Show>
          </div>
        </details>
        <Show when={sources.loading || budget.loading || feedback.loading}>
          <SkeletonList rows={3} label="Loading management data" />
        </Show>
        <Show when={sources.error || versions.error || budget.error || feedback.error || job.error}>
          <p role="alert" class="error">
            {errorText(
              sources.error || versions.error || budget.error || feedback.error || job.error,
            )}
          </p>
        </Show>
        <p role="status" class="admin-message" ref={messageLine} tabIndex={-1}>{message()}</p>
      </Show>
    </div>
  );
}
