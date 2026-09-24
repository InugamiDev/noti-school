import { createSignal, For, Show } from 'solid-js';
import { createRemoteResource as createResource } from './resource';
import { SourceCreate, VersionCreate, VersionAction } from '@noti/contracts';
import { get, post, request, errorText } from './api';
import { Schemas } from '@noti/contracts';
import { scoped } from './App';
import Pagination, { pageSuffix } from './Pagination';
export default function Admin(props: { institution: string; allowed: boolean }) {
  const [selected, setSelected] = createSignal(''),
    [message, setMessage] = createSignal(''),
    [busy, setBusy] = createSignal(false),
    [jobId, setJobId] = createSignal('');
  const [sourceCursor,setSourceCursor]=createSignal(''),[versionCursor,setVersionCursor]=createSignal(''),[feedbackCursor,setFeedbackCursor]=createSignal('');
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
      setMessage('Action accepted. Check the updated status below.');
    } catch (e) {
      setMessage(errorText(e));
    } finally {
      setBusy(false);
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
              <select value={selected()} onChange={(e) => {setSelected(e.currentTarget.value);setVersionCursor('');}}>
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
                    if (
                      !(file instanceof File) ||
                      !file.size ||
                      file.size > 20 * 1024 * 1024 ||
                      !['application/pdf', 'text/plain'].includes(file.type)
                    )
                      throw new Error('Invalid file');
                    const metadata = VersionCreate.parse({
                      label: data.get('label'),
                      effective_from: data.get('from')
                        ? new Date(String(data.get('from'))).toISOString()
                        : null,
                      effective_until: data.get('until')
                        ? new Date(String(data.get('until'))).toISOString()
                        : null,
                    });
                    const body = new FormData();
                    body.set('metadata', JSON.stringify(metadata));
                    body.set('file', file);
                    const result = await post(
                      scoped(props.institution, '/sources/{source_id}/versions', {
                        source_id: selected(),
                      }),
                      'Job',
                      body,
                      { headers: { 'Idempotency-Key': crypto.randomUUID() } },
                    );
                    setJobId(result.id);
                    await refreshVersions();
                  });
                }}
              >
                <h3>Upload a version</h3>
                <label>
                  Version label
                  <input name="label" maxLength={100} required />
                </label>
                <label>
                  PDF or UTF-8 text · up to 20 MiB
                  <input name="file" type="file" accept="application/pdf,text/plain" required />
                </label>
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
                <button disabled={busy()}>Upload version</button>
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
                  <div class="actions">
                    <For each={['reviewed', 'resolved'] as const}>
                      {(status) => (
                        <button
                          disabled={busy()}
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
