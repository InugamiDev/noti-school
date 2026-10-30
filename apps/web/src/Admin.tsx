// intent: collection administration on the Clay kit: source creation and version upload/fetch (TextField, Select,
//         loading Buttons), version status badges, passage and report review, budget and graph forms. Authority still
//         comes from the Me membership passed in as `allowed`; every request body and header is unchanged.
// status: done
// next: file and datetime inputs stay native (no UI kit wrapper); style changes belong in app/Page.module.scss.
//       Until identity and each first load settle, the cards render as shells with skeletons, never the forbidden notice.
// confidence: high
import { createMemo, createSignal, For, Show, onCleanup, type Resource } from 'solid-js';
import ChevronRight from 'lucide-solid/icons/chevron-right';
import CircleAlert from 'lucide-solid/icons/circle-alert';
import Download from 'lucide-solid/icons/download';
import RefreshCw from 'lucide-solid/icons/refresh-cw';
import ShieldAlert from 'lucide-solid/icons/shield-alert';
import { createRemoteResource as createResource } from './resource';
import { SourceCreate, VersionCreate, VersionAction, GraphEntityCreate, GraphEdgeCreate, GraphEdgeAction } from '@noti/contracts';
import { get, post, request, errorText, readAnswer, safeLink } from './api';
import { Schemas } from '@noti/contracts';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
import { Badge, Button, cx, LoadingRegion, Select, Skeleton, SkeletonText, TextField } from './ui';
import { answerPresentation, feedbackCategoryLabels, feedbackStatusLabels, indexingText, versionBadge } from './app/workspace';
import page from './app/Page.module.scss';
import styles from './app/Admin.module.scss';
const kinds = [
  { value: 'pdf', label: 'PDF' },
  { value: 'text', label: 'Text' },
  { value: 'url', label: 'Official URL' },
];
const visibilities = [
  { value: 'institution', label: 'Institution' },
  { value: 'admin', label: 'Administrators' },
];
const languages = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
];
const entityKinds = GraphEntityCreate.shape.kind.options.map((kind) => ({ value: kind, label: kind }));
// Placeholders shaped like the real cards, so the grid keeps its size when the data arrives.
function FieldSkeleton(props: { hint?: boolean }) {
  return (
    <div class={page.field}>
      <SkeletonText width="35%" />
      <Skeleton height="44px" radius="sm" />
      <Show when={props.hint}>
        <SkeletonText class={page.hint} width="85%" />
      </Show>
    </div>
  );
}
function SourcesSkeleton() {
  return (
    <>
      <div class={page.form}>
        <SkeletonText class={page.h3} width="30%" />
        <FieldSkeleton />
        <div class={page.formRow}>
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
        <FieldSkeleton hint />
        <Skeleton class={styles.pill} width="148px" height="44px" />
      </div>
      <div class={styles.divider} />
      <FieldSkeleton />
    </>
  );
}
function ItemSkeleton() {
  return (
    <div class={page.item}>
      <SkeletonText class={page.h3} width="40%" />
      <SkeletonText lines={2} />
      <Skeleton class={styles.pill} width="180px" height="36px" />
    </div>
  );
}
function PassageSkeleton() {
  return (
    <div class={page.item}>
      <SkeletonText class={page.h3} width="25%" />
      <SkeletonText class={page.meta} width="35%" />
      <SkeletonText lines={3} />
    </div>
  );
}
// True once a resource has produced a value or an error; later refetches keep their content on screen.
const settled = (resource: Resource<unknown>) => createMemo((done: boolean) => done || resource() !== undefined || !!resource.error, false);
export default function Admin(props: { institution: string; allowed: boolean; identityUnavailable?: boolean; pending: boolean; since?: number }) {
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
      const answer = await readAnswer(value.answer);
      if (value.feedback.id !== key.report || value.feedback.institution_id !== key.institution || answer.institution_id !== key.institution || value.feedback.answer_id !== answer.id) throw new Error('Scope mismatch');
      return { ...value, answer };
    },
  );
  const [graph, { refetch: refreshGraph }] = createResource(
    () => props.allowed && props.institution ? { id: props.institution, cursor: graphCursor() } : false,
    key => get(scoped(key.id, '/graph') + pageSuffix(key.cursor), 'GraphEdgePage'),
  );
  const urlSource = () => sources()?.items.find(s => s.id === selected())?.kind === 'url';
  const [sources, { refetch: refreshSources }] = createResource(
    () => props.allowed && props.institution ? {id:props.institution,cursor:sourceCursor()} : false,
    (key) => get(scoped(key.id, '/sources')+pageSuffix(key.cursor), 'SourcePage'),
  );
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
  const sourcesSettled = settled(sources), budgetSettled = settled(budget), feedbackSettled = settled(feedback);
  const [job, { refetch: refreshJob }] = createResource(
    () => (props.allowed && jobId() ? jobId() : false),
    (id) => get(scoped(props.institution, '/jobs/{job_id}', { job_id: id }), 'Job'),
  );
  // Form drafts live in signals so the Clay fields stay controlled; a role change remounts this component and clears them.
  const [title, setTitle] = createSignal(''), [titleError, setTitleError] = createSignal<string>();
  const [sourceKind, setSourceKind] = createSignal('pdf'), [visibility, setVisibility] = createSignal('institution');
  const [sourceUrl, setSourceUrl] = createSignal('');
  const [versionLabel, setVersionLabel] = createSignal(''), [versionLanguage, setVersionLanguage] = createSignal('en');
  const [uploadErrors, setUploadErrors] = createSignal<{ label?: string | undefined; file?: string | undefined }>({});
  const [entityKind, setEntityKind] = createSignal<string>(entityKinds[0]!.value), [entityLabel, setEntityLabel] = createSignal('');
  const [edgeFrom, setEdgeFrom] = createSignal(''), [edgeTo, setEdgeTo] = createSignal('');
  const [edgeRelation, setEdgeRelation] = createSignal(''), [edgeChunk, setEdgeChunk] = createSignal('');
  // Which control started the running action, so only that button shows its spinner.
  const [pending, setPending] = createSignal('');
  async function act(work: () => Promise<unknown>, key = '') {
    if (busy()) return;
    setBusy(true);
    setPending(key);
    setMessage('');
    try {
      await work();
      if (!disposed) setMessage('Action accepted. Check the updated status below.');
    } catch (e) {
      if (!disposed) setMessage(errorText(e));
    } finally {
      if (!disposed) {
        setBusy(false);
        setPending('');
      }
    }
  }
  const sourceOptions = () => [
    { value: '', label: 'Choose a source' },
    ...(sources()?.items.map((s) => ({ value: s.id, label: s.title })) ?? []),
  ];
  const currentVersion = () => sources()?.items.find((s) => s.id === selected())?.current_version_id;
  const fileUrl = (version: string) => scoped(props.institution, '/versions/{version_id}/file', { version_id: version });
  return (
    <>
      <h1 class={page.title} tabIndex={-1}>Collection management</h1>
      <p class={page.lede}>Add documents, review extracted passages and handle reports for your school's collection.</p>
      <Show
        when={props.allowed || props.pending}
        fallback={
          <div class={page.notice}>
            <ShieldAlert size={18} aria-hidden="true" />
            <div class={page.noticeBody}>
              <Show
                when={!props.identityUnavailable}
                fallback={<p>Your account could not be checked right now, so administration is unavailable. Try again in a moment.</p>}
              >
                <p>Sign in with an administrator membership to manage this collection.</p>
                <div class={page.links}>
                  <Button size="sm" href="#/auth">Sign in</Button>
                </div>
              </Show>
            </div>
          </div>
        }
      >
        <div class={styles.grid}>
          <section class={cx(page.card, styles.section)} aria-labelledby="admin-sources">
            <h2 id="admin-sources" class={styles.h2}>Sources and versions</h2>
            <LoadingRegion
              loading={props.pending || !sourcesSettled()}
              since={props.since}
              label="Loading collection sources…"
              innerClass={styles.stack}
              skeleton={<SourcesSkeleton />}
            >
              <form
                class={page.form}
                novalidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!title().trim()) {
                    setTitleError('Enter a document title.');
                    return;
                  }
                  void act(async () => {
                    const kind = sourceKind();
                    const body = SourceCreate.parse({
                      title: title(),
                      kind,
                      visibility: visibility(),
                      ...(kind === 'url' ? { original_url: sourceUrl() } : {}),
                    });
                    const result = await post(scoped(props.institution, '/sources'), 'Source', body);
                    setSelected(result.id);
                    setVersionCursor('');
                    await refreshSources();
                  }, 'source');
                }}
              >
                <h3 class={page.h3}>New source</h3>
                <TextField
                  label="Document title"
                  name="title"
                  value={title()}
                  onChange={(value) => {
                    setTitle(value);
                    setTitleError(value.length > 300 ? 'Use at most 300 characters.' : undefined);
                  }}
                  error={titleError()}
                  required
                />
                <div class={page.formRow}>
                  <Select label="Format" name="kind" options={kinds} value={sourceKind()} onChange={setSourceKind} />
                  <Select label="Visibility" name="visibility" options={visibilities} value={visibility()} onChange={setVisibility} />
                </div>
                <TextField
                  label="Original URL (for URL sources)"
                  name="url"
                  type="url"
                  placeholder="https://"
                  hint="Required for official URL sources. Only https addresses are accepted."
                  value={sourceUrl()}
                  onChange={setSourceUrl}
                />
                <Button type="submit" class={page.submit} disabled={busy()} loading={pending() === 'source'} loadingLabel="Creating">
                  Create source
                </Button>
              </form>
              <div class={styles.divider} />
              <Select
                label="Select source"
                placeholder="Pick a source to see its versions"
                options={sourceOptions()}
                value={selected()}
                onChange={(value) => {setSelected(value);setVersionCursor('');setReviewVersion('');setChunkCursor('');}}
              />
              <Pagination cursor={sourceCursor()} next={sources()?.next_cursor} change={setSourceCursor} label="Source pages"/>
              <Show when={selected()}>
                <a class={page.link} href={`#/sources/${selected()}`}>
                  Read source & versions
                </a>
                <form
                  class={page.form}
                  novalidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    const file = data.get('file');
                    const missing = {
                      label: versionLabel().trim() ? undefined : 'Enter a version label.',
                      file: !urlSource() && !(file instanceof File && file.size) ? 'Choose a PDF or text file.' : undefined,
                    };
                    setUploadErrors(missing);
                    if (missing.label || missing.file) return;
                    void act(async () => {
                      if (!urlSource() && (
                        !(file instanceof File) ||
                        !file.size ||
                        file.size > 20 * 1024 * 1024 ||
                        !['application/pdf', 'text/plain'].includes(file.type)
                      ))
                        throw new Error('Invalid file');
                      const metadata = VersionCreate.parse({
                        label: versionLabel(),
                        language: versionLanguage(),
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
                    }, 'upload');
                  }}
                >
                  <h3 class={page.h3}>{urlSource() ? 'Fetch a saved URL' : 'Upload a version'}</h3>
                  <TextField
                    label="Version label"
                    name="label"
                    value={versionLabel()}
                    onChange={(value) => {
                      setVersionLabel(value);
                      setUploadErrors({ ...uploadErrors(), label: value.length > 100 ? 'Use at most 100 characters.' : undefined });
                    }}
                    error={uploadErrors().label}
                    required
                  />
                  <Select label="Document language" name="language" options={languages} value={versionLanguage()} onChange={setVersionLanguage} />
                  <Show when={!urlSource()}>
                    <div class={page.field}>
                      <label for="admin-file">PDF or UTF-8 text · up to 20 MiB</label>
                      <input
                        id="admin-file"
                        class={page.input}
                        name="file"
                        type="file"
                        accept="application/pdf,text/plain"
                        aria-invalid={uploadErrors().file ? 'true' : undefined}
                        aria-describedby={uploadErrors().file ? 'admin-file-error' : undefined}
                        onChange={() => setUploadErrors({ ...uploadErrors(), file: undefined })}
                      />
                      <Show when={uploadErrors().file}>
                        <span id="admin-file-error" class={styles.fieldError}>{uploadErrors().file}</span>
                      </Show>
                    </div>
                  </Show>
                  <Show when={urlSource()}><p class={page.notice}><CircleAlert size={18} aria-hidden="true" />Fetch only this source’s saved URL. Fetched content requires review and is not approved evidence.</p></Show>
                  <div class={page.formRow}>
                    <label class={page.field}>
                      Effective from
                      <input class={page.input} name="from" type="datetime-local" />
                    </label>
                    <label class={page.field}>
                      Effective until
                      <input class={page.input} name="until" type="datetime-local" />
                    </label>
                  </div>
                  <Button variant="primary" type="submit" class={page.submit} disabled={busy()} loading={pending() === 'upload'} loadingLabel={urlSource() ? 'Fetching' : 'Uploading'}>
                    {urlSource() ? 'Fetch saved URL' : 'Upload version'}
                  </Button>
                </form>
              </Show>
              <Show when={selected() && versions() && !versions()!.items.length}>
                <p class={page.muted}>No versions for this source yet.</p>
              </Show>
              <For each={versions()?.items}>
                {(v) => {
                  const badge = () => versionBadge(v, currentVersion());
                  return (
                    <article class={page.item}>
                      <div class={page.itemHead}>
                        <h3 class={page.h3}>{v.label}</h3>
                        <Badge tone={badge().tone} dot>{badge().label}</Badge>
                      </div>
                      <p class={page.small}>
                        Status: {v.status} · {indexingText(v.indexing)}
                      </p>
                      <div class={page.actions}>
                        <Button size="sm" variant="ghost" onClick={() => { setReviewVersion(v.id); setChunkCursor(''); }}>Review passages</Button>
                        <For each={['approve', 'archive', 'retry_index'] as const}>
                          {(action) => (
                            <Button
                              size="sm"
                              disabled={busy()}
                              loading={pending() === `${v.id}:${action}`}
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
                                }, `${v.id}:${action}`)
                              }
                            >
                              {action === 'retry_index'
                                ? 'Retry indexing'
                                : action === 'approve'
                                  ? 'Approve'
                                  : 'Archive'}
                            </Button>
                          )}
                        </For>
                      </div>
                    </article>
                  );
                }}
              </For>
              <Pagination cursor={versionCursor()} next={versions()?.next_cursor} change={setVersionCursor} label="Version pages"/>
              <Show when={reviewVersion()}>
                <section class={cx(page.reader, styles.passages)} aria-label="Extracted passages" data-reader>
                  <h3 class={page.h3}>Extracted passages</h3>
                  <p class={page.small}>Read each page before deciding whether to approve this version. Opening this view does not mark it reviewed.</p>
                  <a class={page.link} href={fileUrl(reviewVersion())} target="_blank" rel="noopener noreferrer"><Download size={16} aria-hidden="true" />Open original file</a>
                  <LoadingRegion
                    loading={chunks.loading}
                    label="Loading passages…"
                    innerClass={styles.stackReader}
                    skeleton={<PassageSkeleton />}
                  >
                    <Show when={chunks.error}><p role="alert" class={cx(page.notice, page.error)}>{errorText(chunks.error)}</p></Show>
                    <Show when={chunks()}>{data => <>
                      <For each={data().items} fallback={<p class={page.notice}>No extracted text on this page. Inspect the original file; extraction may need attention.</p>}>{chunk => <article class={page.item}>
                        <h4 class={page.h3}>Passage {chunk.ordinal + 1}</h4>
                        <p class={page.meta}>{chunk.locator.page ? `Page ${chunk.locator.page}` : 'Page not supplied'}{chunk.locator.section ? ` · ${chunk.locator.section}` : ''}</p>
                        <p class={cx(page.quote, page.passage)}>{chunk.text}</p>
                        <div class={styles.ids}>
                          <label class={page.field}>Evidence chunk ID<input class={page.input} readonly value={chunk.id} onFocus={e => e.currentTarget.select()}/></label>
                          <label class={page.field}>Version ID<input class={page.input} readonly value={chunk.version_id}/></label>
                          <label class={page.field}>Source ID<input class={page.input} readonly value={chunk.source_id}/></label>
                        </div>
                      </article>}</For>
                      <Pagination cursor={chunkCursor()} next={data().next_cursor} change={setChunkCursor} label="Passage pages"/>
                    </>}</Show>
                  </LoadingRegion>
                </section>
              </Show>
              <Show when={jobId()}>
                <div class={styles.job}>
                  <h3 class={page.h3}>Indexing status</h3>
                  <div class={page.itemHead}>
                    <LoadingRegion
                      loading={!job() && !job.error}
                      label="Loading job status…"
                      skeleton={<Skeleton class={styles.pill} width="88px" height="26px" />}
                    >
                      <Show when={job()}>
                        {(current) => (
                          <Badge tone={current().state === 'failed' ? 'danger' : current().state === 'succeeded' ? 'sage' : 'clay'} dot>
                            {current().state}
                          </Badge>
                        )}
                      </Show>
                    </LoadingRegion>
                    <Show when={job()?.error_code}>{code => <span class={page.meta}>{code()}</span>}</Show>
                    <Button size="sm" variant="ghost" onClick={() => void refreshJob()}>
                      <RefreshCw aria-hidden="true" />
                      Refresh job
                    </Button>
                  </div>
                </div>
              </Show>
            </LoadingRegion>
          </section>
          <div class={styles.side}>
            <section class={cx(page.card, styles.section)} aria-labelledby="admin-budget">
              <h2 id="admin-budget" class={styles.h2}>Monthly AI budget</h2>
              <LoadingRegion
                loading={props.pending || !budgetSettled()}
                since={props.since}
                label="Loading budget…"
                innerClass={styles.stack}
                skeleton={<SkeletonText class={styles.dlSkeleton} lines={4} lastWidth="100%" />}
              >
                <Show when={budget()} fallback={<p class={page.muted}>Budget unavailable.</p>}>
                  {(b) => (
                    <dl class={page.dl}>
                      <dt>Month</dt>
                      <dd>{b().month}</dd>
                      <dt>Spent</dt>
                      <dd>${(b().spent_micro_usd / 1e6).toFixed(2)}</dd>
                      <dt>Reserved</dt>
                      <dd>${(b().reserved_micro_usd / 1e6).toFixed(2)}</dd>
                      <dt>Application ceiling</dt>
                      <dd>${(b().cap_micro_usd / 1e6).toFixed(2)}</dd>
                    </dl>
                  )}
                </Show>
              </LoadingRegion>
            </section>
            <section class={cx(page.card, styles.section)} aria-labelledby="admin-feedback">
              <h2 id="admin-feedback" class={styles.h2}>Feedback</h2>
              <LoadingRegion
                loading={props.pending || !feedbackSettled()}
                since={props.since}
                label="Loading feedback…"
                innerClass={styles.stack}
                skeleton={<ItemSkeleton />}
              >
                <For each={feedback()?.items} fallback={<p class={page.muted}>No feedback loaded.</p>}>
                  {(f) => (
                    <article class={page.item}>
                      <div class={page.itemHead}>
                        <h3 class={page.h3}>{feedbackCategoryLabels[f.category]}</h3>
                        <Badge tone={f.status === 'open' ? 'clay' : f.status === 'resolved' ? 'sage' : 'neutral'} dot>{feedbackStatusLabels[f.status]}</Badge>
                      </div>
                      <Show when={f.comment}><p class={page.passage}>{f.comment}</p></Show>
                      <div class={page.actions}>
                        <Button size="sm" variant="ghost" loading={reportId() === f.id && context.loading} onClick={() => reportId() === f.id ? void refreshContext() : setReportId(f.id)}>Review report context</Button>
                      </div>
                      <Show when={reportId() === f.id}>
                        <LoadingRegion
                          loading={context.loading}
                          label="Loading report context…"
                          innerClass={styles.stackItem}
                          skeleton={<SkeletonText lines={4} />}
                        >
                          <Show when={context.error}><p role="alert" class={cx(page.notice, page.error)}>Report context unavailable. Review status has not been changed. {errorText(context.error)}</p></Show>
                          <Show when={context()}>{c => <section class={page.reader} aria-label="Report context" data-reader>
                            <h4 class={page.h3}>Reported question</h4><p class={cx(page.quote, page.passage)}>{c().question}</p>
                            <h4 class={page.h3}>Reported answer</h4>
                            <div><Badge tone={answerPresentation(c().answer.status).tone} dot>{c().answer.status}</Badge></div>
                            <For each={c().answer.claims}>{claim => <p class={page.passage}>{claim.text}</p>}</For>
                            <Show when={c().answer.explanation}><p class={page.notice}>{c().answer.explanation}</p></Show>
                            <h4 class={page.h3}>Current citations</h4>
                            <For each={c().answer.evidence} fallback={<p class={page.muted}>No citations currently accessible.</p>}>{evidence => <article class={page.item}>
                              <h4 class={page.h3}>{evidence.title} · {evidence.version_label}</h4>
                              <p class={page.meta}>{evidence.locator.page ? `Page ${evidence.locator.page}` : ''}{evidence.locator.section ? ` · ${evidence.locator.section}` : ''}</p>
                              <blockquote class={page.quote}>{evidence.quote}</blockquote>
                              <div class={page.actions}>
                                <a class={page.link} href={`${fileUrl(evidence.version_id)}${evidence.locator.page ? `#page=${evidence.locator.page}` : ''}`} target="_blank" rel="noopener noreferrer">Open cited original</a>
                                <Show when={safeLink(evidence.original_url)}>{url => <a class={page.link} href={url()} target="_blank" rel="noopener noreferrer">Original website</a>}</Show>
                              </div>
                              <label class={page.field}>Citation ID<input class={page.input} readonly value={evidence.id}/></label>
                            </article>}</For>
                          </section>}</Show>
                        </LoadingRegion>
                      </Show>
                      <div class={page.actions}>
                        <For each={['reviewed', 'resolved'] as const}>
                          {(status) => (
                            <Button
                              size="sm"
                              disabled={busy() || reportId() !== f.id || !context() || context.loading || !!context.error}
                              loading={pending() === `${f.id}:${status}`}
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
                                }, `${f.id}:${status}`)
                              }
                            >
                              Mark {status}
                            </Button>
                          )}
                        </For>
                      </div>
                    </article>
                  )}
                </For>
                <Pagination cursor={feedbackCursor()} next={feedback()?.next_cursor} change={setFeedbackCursor} label="Feedback pages"/>
              </LoadingRegion>
            </section>
          </div>
        </div>
        <LoadingRegion
          loading={props.pending}
          since={props.since}
          label="Loading graph administration…"
          skeleton={
            <div class={cx(page.card, styles.graph)}>
              <div class={styles.graphSummary}>
                <SkeletonText width="16rem" />
              </div>
            </div>
          }
        >
          <details class={cx(page.card, styles.graph)}>
            <summary>
              <ChevronRight class={cx(styles.chevron)} size={18} aria-hidden="true" />
              Evidence graph administration
            </summary>
            <p class={page.small}>Relations require a readable evidence chunk in this institution. Creating a candidate does not approve evidence or establish coverage.</p>
            <form class={page.form} novalidate onSubmit={e => {
              e.preventDefault();
              void act(async () => {
                const body = GraphEntityCreate.parse({ kind: entityKind(), label: entityLabel() });
                const result = await post(scoped(props.institution, '/graph/entities'), 'GraphEntity', body);
                setEntityId(result.id);
              }, 'entity');
            }}>
              <h3 class={page.h3}>New entity</h3>
              <div class={page.formRow}>
                <Select label="Entity kind" name="kind" options={entityKinds} value={entityKind()} onChange={setEntityKind} />
                <TextField label="Entity label" name="label" value={entityLabel()} onChange={setEntityLabel} required />
              </div>
              <Button type="submit" class={page.submit} disabled={busy()} loading={pending() === 'entity'} loadingLabel="Creating">Create graph entity</Button>
            </form>
            <Show when={entityId()}><p class={page.small}>Created entity ID: <code class={page.code}>{entityId()}</code></p></Show>
            <form class={page.form} novalidate onSubmit={e => {
              e.preventDefault();
              void act(async () => {
                const body = GraphEdgeCreate.parse({ from_entity_id: edgeFrom(), to_entity_id: edgeTo(), relation: edgeRelation(), evidence_chunk_id: edgeChunk() });
                await post(scoped(props.institution, '/graph/edges'), 'GraphEdge', body); await refreshGraph();
              }, 'edge');
            }}>
              <h3 class={page.h3}>New candidate relation</h3>
              <div class={page.formRow}>
                <TextField label="From entity ID" name="from" value={edgeFrom()} onChange={setEdgeFrom} required />
                <TextField label="To entity ID" name="to" value={edgeTo()} onChange={setEdgeTo} required />
              </div>
              <div class={page.formRow}>
                <TextField label="Relation" name="relation" value={edgeRelation()} onChange={setEdgeRelation} required />
                <TextField label="Evidence chunk ID" name="chunk" value={edgeChunk()} onChange={setEdgeChunk} required />
              </div>
              <Button type="submit" class={page.submit} disabled={busy()} loading={pending() === 'edge'} loadingLabel="Creating">Create candidate relation</Button>
            </form>
            <LoadingRegion
              loading={graph.loading}
              label="Loading graph relations…"
              innerClass={styles.stack}
              skeleton={<ItemSkeleton />}
            >
              <Show when={graph.error}><p role="alert" class={cx(page.notice, page.error)}>{errorText(graph.error)}</p></Show>
              <Show when={graph()}>
                <For each={graph()?.items} fallback={<p class={page.muted}>No graph relations returned for this institution.</p>}>{edge => <article class={page.item}>
                  <div class={page.itemHead}>
                    <h3 class={page.h3}>{edge.relation}</h3>
                    <Badge tone={edge.status === 'approved' ? 'sage' : edge.status === 'rejected' ? 'neutral' : 'clay'} dot>{edge.status}</Badge>
                  </div>
                  <p class={page.meta}>{edge.from_entity_id} to {edge.to_entity_id}</p>
                  <For each={edge.evidence}>{evidence => <a class={page.link} href={`#/sources/${evidence.source_id}`}>{evidence.title} · {evidence.version_label} · {evidence.locator.page ? `Page ${evidence.locator.page}` : evidence.locator.section}</a>}</For>
                  <div class={page.actions}>
                    <For each={['approved', 'rejected'] as const}>{status => <Button size="sm" disabled={busy()} loading={pending() === `${edge.id}:${status}`} onClick={() => void act(async () => {
                      await request(scoped(props.institution, '/graph/edges/{edge_id}', { edge_id: edge.id }), Schemas.GraphEdge, { method: 'PATCH', body: JSON.stringify(GraphEdgeAction.parse({ status })) });
                      await refreshGraph();
                    }, `${edge.id}:${status}`)}>{status === 'approved' ? 'Approve relation' : 'Reject relation'}</Button>}</For>
                  </div>
                </article>}</For>
                <Pagination cursor={graphCursor()} next={graph()?.next_cursor} change={setGraphCursor} label="Graph pages"/>
              </Show>
            </LoadingRegion>
          </details>
        </LoadingRegion>
        <Show when={sources.error || versions.error || budget.error || feedback.error || job.error}>
          <p role="alert" class={cx(page.notice, page.error)}>
            {errorText(
              sources.error || versions.error || budget.error || feedback.error || job.error,
            )}
          </p>
        </Show>
        <p role="status" class={styles.message}>{message()}</p>
      </Show>
    </>
  );
}
