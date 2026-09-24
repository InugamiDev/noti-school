import { createSignal, For, Show, onCleanup } from 'solid-js';
import { createRemoteResource as createResource } from './resource';
import { SourceCreate, VersionCreate, VersionAction, GraphEntityCreate, GraphEdgeCreate, GraphEdgeAction } from '@noti/contracts';
import { get, post, request, errorText, readAnswer, safeLink } from './api';
import { Schemas } from '@noti/contracts';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
export default function Admin(props: { institution: string; allowed: boolean }) {
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
      const answer = readAnswer(value.answer);
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
  const [job, { refetch: refreshJob }] = createResource(
    () => (props.allowed && jobId() ? jobId() : false),
    (id) => get(scoped(props.institution, '/jobs/{job_id}', { job_id: id }), 'Job'),
  );
  async function act(work: () => Promise<unknown>) {
    if (busy()) return;
    setBusy(true);
    setMessage('');
    try {
      await work();
      if (!disposed) setMessage('Action accepted. Check the updated status below.');
    } catch (e) {
      if (!disposed) setMessage(errorText(e));
    } finally {
      if (!disposed) setBusy(false);
    }
  }
  return (
    <>
      <h1 tabIndex={-1}>Collection management</h1>
      <Show
        when={props.allowed}
        fallback={
          <div class="notice">
            <p>Sign in with an administrator membership to manage this collection.</p>
            <a href="#/auth">Sign in</a>
          </div>
        }
      >
        <div class="admin-grid">
          <section>
            <h2>Sources & versions</h2>
            <form
              class="stack"
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
                  setSelected(result.id);
                  setVersionCursor('');
                  await refreshSources();
                });
              }}
            >
              <label>
                Document title
                <input name="title" required maxLength={300} />
              </label>
              <div class="form-row">
                <label>
                  Format
                  <select name="kind">
                    <option value="pdf">PDF</option>
                    <option value="text">Text</option>
                    <option value="url">Official URL</option>
                  </select>
                </label>
                <label>
                  Visibility
                  <select name="visibility">
                    <option value="institution">Institution</option>
                    <option value="admin">Administrators</option>
                  </select>
                </label>
              </div>
              <label>
                Original URL (for URL sources)
                <input name="url" type="url" placeholder="https://" />
              </label>
              <button disabled={busy()}>Create source</button>
            </form>
            <label class="stack">
              Select source
              <select value={selected()} onChange={(e) => {setSelected(e.currentTarget.value);setVersionCursor('');setReviewVersion('');setChunkCursor('');}}>
                <option value="">Choose a source</option>
                <For each={sources()?.items}>
                  {(s) => (
                    <option value={s.id} selected={selected() === s.id}>
                      {s.title}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <Pagination cursor={sourceCursor()} next={sources()?.next_cursor} change={setSourceCursor} label="Source pages"/>
            <Show when={selected()}>
              <a class="text-link" href={`#/sources/${selected()}`}>
                Read source & versions
              </a>
              <form
                class="stack"
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
                  });
                }}
              >
                <h3>{urlSource() ? 'Fetch a saved URL' : 'Upload a version'}</h3>
                <label>
                  Version label
                  <input name="label" maxLength={100} required />
                </label>
                <label>Document language<select name="language"><option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>
                <Show when={!urlSource()}><label>
                  PDF or UTF-8 text · up to 20 MiB
                  <input name="file" type="file" accept="application/pdf,text/plain" required />
                </label></Show>
                <Show when={urlSource()}><p class="notice">Fetch only this source’s saved URL. Fetched content requires review and is not approved evidence.</p></Show>
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
                <button disabled={busy()}>{urlSource() ? 'Fetch saved URL' : 'Upload version'}</button>
              </form>
            </Show>
            <For each={versions()?.items}>
              {(v) => (
                <article class="version-row">
                  <h3>{v.label}</h3>
                  <p>
                    {v.status} · Indexing: {v.indexing}
                  </p>
                  <div class="actions">
                    <button onClick={() => { setReviewVersion(v.id); setChunkCursor(''); }}>Review passages</button>
                    <For each={['approve', 'archive', 'retry_index'] as const}>
                      {(action) => (
                        <button
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
                            })
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
            <Show when={reviewVersion()}>
              <section class="reader" aria-label="Extracted passages">
                <h3>Extracted passages</h3>
                <p class="muted">Read each page before deciding whether to approve this version. Opening this view does not mark it reviewed.</p>
                <a href={scoped(props.institution, '/versions/{version_id}/file', { version_id: reviewVersion() })} target="_blank" rel="noopener noreferrer">Open original file</a>
                <Show when={chunks.loading}><p role="status">Loading passages…</p></Show>
                <Show when={chunks.error}><p role="alert">{errorText(chunks.error)}</p></Show>
                <Show when={chunks()}>{page => <>
                  <For each={page().items} fallback={<p>No extracted text on this page. Inspect the original file; extraction may need attention.</p>}>{chunk => <article class="version-row">
                    <h4>Passage {chunk.ordinal + 1}</h4>
                    <p>{chunk.locator.page ? `Page ${chunk.locator.page}` : 'Page not supplied'}{chunk.locator.section ? ` · ${chunk.locator.section}` : ''}</p>
                    <p class="passage">{chunk.text}</p>
                    <label class="stack">Evidence chunk ID<input readonly value={chunk.id} onFocus={e => e.currentTarget.select()}/></label>
                    <label class="stack">Version ID<input readonly value={chunk.version_id}/></label>
                    <label class="stack">Source ID<input readonly value={chunk.source_id}/></label>
                  </article>}</For>
                  <Pagination cursor={chunkCursor()} next={page().next_cursor} change={setChunkCursor} label="Passage pages"/>
                </>}</Show>
              </section>
            </Show>
            <Show when={jobId()}>
              <h3>Indexing status</h3>
              <p>
                {job()?.state || 'Loading…'} {job()?.error_code}
              </p>
              <button onClick={() => void refreshJob()}>Refresh job</button>
            </Show>
          </section>
          <section>
            <h2>Monthly AI budget</h2>
            <Show when={budget()} fallback={<p>Budget unavailable.</p>}>
              {(b) => (
                <dl>
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
            <h2>Feedback</h2>
            <For each={feedback()?.items} fallback={<p>No feedback loaded.</p>}>
              {(f) => (
                <article class="version-row">
                  <h3>{f.category}</h3>
                  <p>{f.comment}</p>
                  <p>{f.status}</p>
                  <button onClick={() => reportId() === f.id ? void refreshContext() : setReportId(f.id)}>Review report context</button>
                  <Show when={reportId() === f.id}>
                    <Show when={context.loading}><p role="status">Loading report context…</p></Show>
                    <Show when={context.error}><p role="alert">Report context unavailable. Review status has not been changed. {errorText(context.error)}</p></Show>
                    <Show when={context()}>{c => <section class="reader" aria-label="Report context">
                      <h4>Reported question</h4><p class="passage">{c().question}</p>
                      <h4>Reported answer</h4><p>{c().answer.status}</p>
                      <For each={c().answer.claims}>{claim => <p class="passage">{claim.text}</p>}</For>
                      <Show when={c().answer.explanation}><p class="notice">{c().answer.explanation}</p></Show>
                      <h4>Current citations</h4>
                      <For each={c().answer.evidence} fallback={<p>No citations currently accessible.</p>}>{evidence => <article class="version-row">
                        <h4>{evidence.title} · {evidence.version_label}</h4>
                        <p>{evidence.locator.page ? `Page ${evidence.locator.page}` : ''}{evidence.locator.section ? ` · ${evidence.locator.section}` : ''}</p>
                        <blockquote>{evidence.quote}</blockquote>
                        <div class="actions">
                          <a href={`${scoped(props.institution, '/versions/{version_id}/file', { version_id: evidence.version_id })}${evidence.locator.page ? `#page=${evidence.locator.page}` : ''}`} target="_blank" rel="noopener noreferrer">Open cited original</a>
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
                          disabled={busy() || reportId() !== f.id || !context() || context.loading || !!context.error}
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
                            })
                          }
                        >
                          Mark {status}
                        </button>
                      )}
                    </For>
                  </div>
                </article>
              )}
            </For>
          </section>
        </div>
        <Pagination cursor={feedbackCursor()} next={feedback()?.next_cursor} change={setFeedbackCursor} label="Feedback pages"/>
        <details>
          <summary>Evidence graph administration</summary>
          <p class="muted">Relations require a readable evidence chunk in this institution. Creating a candidate does not approve evidence or establish coverage.</p>
          <form class="stack" onSubmit={e => {
            e.preventDefault(); const data = new FormData(e.currentTarget);
            void act(async () => {
              const body = GraphEntityCreate.parse({ kind: data.get('kind'), label: data.get('label') });
              const result = await post(scoped(props.institution, '/graph/entities'), 'GraphEntity', body);
              setEntityId(result.id);
            });
          }}>
            <label>Entity kind<select name="kind"><For each={GraphEntityCreate.shape.kind.options}>{kind => <option value={kind}>{kind}</option>}</For></select></label>
            <label>Entity label<input name="label" required maxLength={300}/></label>
            <button disabled={busy()}>Create graph entity</button>
          </form>
          <Show when={entityId()}><p>Created entity ID: <code>{entityId()}</code></p></Show>
          <form class="stack" onSubmit={e => {
            e.preventDefault(); const data = new FormData(e.currentTarget);
            void act(async () => {
              const body = GraphEdgeCreate.parse({ from_entity_id: data.get('from'), to_entity_id: data.get('to'), relation: data.get('relation'), evidence_chunk_id: data.get('chunk') });
              await post(scoped(props.institution, '/graph/edges'), 'GraphEdge', body); await refreshGraph();
            });
          }}>
            <label>From entity ID<input name="from" required/></label>
            <label>To entity ID<input name="to" required/></label>
            <label>Relation<input name="relation" maxLength={100} required/></label>
            <label>Evidence chunk ID<input name="chunk" required/></label>
            <button disabled={busy()}>Create candidate relation</button>
          </form>
          <Show when={graph.loading}><p role="status">Loading graph relations…</p></Show>
          <Show when={graph.error}><p role="alert">{errorText(graph.error)}</p></Show>
          <Show when={graph()}>
            <For each={graph()?.items} fallback={<p>No graph relations returned for this institution.</p>}>{edge => <article class="version-row">
              <h3>{edge.relation}</h3><p>{edge.status} · {edge.from_entity_id} → {edge.to_entity_id}</p>
              <For each={edge.evidence}>{evidence => <a href={`#/sources/${evidence.source_id}`}>{evidence.title} · {evidence.version_label} · {evidence.locator.page ? `Page ${evidence.locator.page}` : evidence.locator.section}</a>}</For>
              <For each={['approved', 'rejected'] as const}>{status => <button disabled={busy()} onClick={() => void act(async () => {
                await request(scoped(props.institution, '/graph/edges/{edge_id}', { edge_id: edge.id }), Schemas.GraphEdge, { method: 'PATCH', body: JSON.stringify(GraphEdgeAction.parse({ status })) });
                await refreshGraph();
              })}>{status === 'approved' ? 'Approve relation' : 'Reject relation'}</button>}</For>
            </article>}</For>
            <Pagination cursor={graphCursor()} next={graph()?.next_cursor} change={setGraphCursor} label="Graph pages"/>
          </Show>
        </details>
        <Show when={sources.loading || budget.loading || feedback.loading}>
          <div class="skeleton" role="status" aria-label="Loading management data" />
        </Show>
        <Show when={sources.error || versions.error || budget.error || feedback.error || job.error}>
          <p role="alert" class="error">
            {errorText(
              sources.error || versions.error || budget.error || feedback.error || job.error,
            )}
          </p>
        </Show>
        <p role="status">{message()}</p>
      </Show>
    </>
  );
}
