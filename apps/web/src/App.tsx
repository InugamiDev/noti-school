import { createEffect, createSignal, For, Show, onCleanup } from 'solid-js';
import { createRemoteResource as createResource } from './resource';
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Pause,
  Play,
  School,
  LogIn,
  History,
  X,
  MessageSquare,
  ExternalLink,
} from 'lucide-solid';
import { AskRequest, type AnswerOutput, type Schemas } from '@noti/contracts';
import type { z } from 'zod';
import { get, post, request, readAnswer, errorText, loadDraft, saveDraft, endpoint, takeAuthCallback } from './api';
import Archive from './Archive';
import Sources from './Sources';
import Auth from './Auth';
import Admin from './Admin';
import CollectionPreview from './CollectionPreview';
import Pagination, { pageSuffix } from './Pagination';
type Institution = z.infer<typeof Schemas.Institution>;
const institutionPath = '/api/v1/institutions/{institution_id}';
export const scoped = (institution: string, suffix: string, params: Record<string, string> = {}) =>
  endpoint(`${institutionPath}${suffix}`, { institution_id: institution, ...params });

// intent: stable prompt-first HTML with truthful service state; status: implemented.
export default function App() {
  const readCallback = () => {
    if (!location.hash.startsWith('#/auth')) return undefined;
    const callback = takeAuthCallback(location.href);
    window.history.replaceState(null, '', callback.clean);
    return callback;
  };
  // Scrub credentials before creating resources, so same-origin requests cannot carry them in Referer.
  const [authCallback, setAuthCallback] = createSignal(readCallback());
  const [route, setRoute] = createSignal(location.hash.slice(1) || '/');
  const hash = () => {
    setAuthCallback(readCallback());
    setRoute(location.hash.slice(1) || '/');
    void refreshCapabilities();
    void refreshMe();
    cancel(false);
    clearTimeout(transitionTimer);
    setTransitioning(false);
    if (route() === '/') {setAnswer(undefined);setConversation(undefined);}
    setHistoryCursor('');
    queueMicrotask(() => document.querySelector<HTMLElement>('main h1, main h2')?.focus());
  };
  window.addEventListener('hashchange', hash);
  onCleanup(() => window.removeEventListener('hashchange', hash));
  const [capabilities, { refetch: refreshCapabilities }] = createResource(() => get('/api/v1/capabilities', 'Capabilities'));
  const [institutions] = createResource(() => get('/api/v1/institutions', 'InstitutionPage'));
  const [me, { refetch: refreshMe }] = createResource(() => get('/api/v1/me', 'Me'));
  const [institution, setInstitution] = createSignal('');
  createEffect(() => {
    const first = institutions()?.items[0];
    if (first && !institution()) {
      const saved = readPreference('institution');
      setInstitution(institutions()?.items.some((i) => i.id === saved) ? saved : first.id);
    }
  });
  const selected = () => institutions()?.items.find((i) => i.id === institution());
  const demo = () => capabilities()?.mode === 'mock' || selected()?.coverage === 'synthetic_demo';
  createEffect(() => {
    if (institution()) writePreference('institution', institution());
  });
  const [draft, setDraft] = createSignal(loadDraft());
  const updateDraft = (text: string) => {
    setDraft(text);
    saveDraft(text);
  };
  const [paused, setPaused] = createSignal(false),
    [zoom, setZoom] = createSignal(0),
    [transitioning, setTransitioning] = createSignal(false);
  let transitionTimer: ReturnType<typeof setTimeout> | undefined;
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal(''),
    [answer, setAnswer] = createSignal<AnswerOutput>();
  const [citation, setCitation] = createSignal('');
  const [conversation,setConversation]=createSignal<{id:string;institution:string}>();
  const [historyCursor,setHistoryCursor]=createSignal('');
  const [feedback, setFeedback] = createSignal(false),
    [feedbackMessage, setFeedbackMessage] = createSignal('');
  const [listCursor, setListCursor] = createSignal('');
  const [history, { refetch: refreshHistory }] = createResource(
    () => route().startsWith('/history') && institution() && me()
      ? { institution: institution(), cursor: listCursor(), user: me()!.identity.user_id } : false,
    async key => ({ ...await get(scoped(key.institution, '/conversations') + pageSuffix(key.cursor), 'ConversationPage'), owner: key.user, institution: key.institution }),
  );
  const visibleHistory = () => history()?.owner === me()?.identity.user_id && history()?.institution === institution() ? history() : undefined;
  let lastUser: string | undefined;
  createEffect(() => {
    const user = me()?.identity.user_id;
    if (user !== lastUser) { setAnswer(undefined); setConversation(undefined); setListCursor(''); }
    lastUser = user;
  });
  let controller: AbortController | undefined;
  let composer!: HTMLTextAreaElement;
  function cancel(announce = true) {
    if (controller) {
      controller.abort();
      controller = undefined;
      setBusy(false);
      if (announce) setError('Request cancelled. Your draft is safe.');
    }
  }
  onCleanup(() => {
    cancel(false);
    clearTimeout(transitionTimer);
  });
  async function ask(event: SubmitEvent) {
    event.preventDefault();
    if (busy()) return;
    setError('');
    setCitation('');
    setFeedback(false);
    if (!institution()) {
      setError('The institution list is unavailable. Please try again later.');
      return;
    }
    const previous = conversation();
    const parsed = AskRequest.safeParse({
      institution_id: institution(),
      question: draft().trim(),
      language: language(),
      ...(previous?.institution === institution()
        ? { conversation_id: previous.id }
        : {}),
      discover: false,
    });
    if (!parsed.success) {
      setError('Enter a question of 1–4,000 characters.');
      return;
    }
    setBusy(true);
    setAnswer(undefined);
    const active = new AbortController();
    controller = active;
    // The request starts before any visual transition. No automatic retries of paid work.
    const pending = post('/api/v1/answers', 'Answer', parsed.data, {
      signal: active.signal,
      headers: { 'Idempotency-Key': crypto.randomUUID() },
    });
    setTransitioning(!matchMedia('(prefers-reduced-motion: reduce)').matches && !paused());
    setZoom((v) => v + 1);
    setRoute('/answer');
    historyReplace('/answer');
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => setTransitioning(false), 600);
    queueMicrotask(() => document.getElementById('answer-heading')?.focus());
    try {
      const result = readAnswer(await pending);
      if (active.signal.aborted) return;
      if (result.institution_id !== institution()) throw new Error('Scope mismatch');
      setAnswer(result);
      setConversation({id:result.conversation_id,institution:result.institution_id});
    } catch (e) {
      if (!active.signal.aborted) setError(errorText(e));
    } finally {
      if (controller === active) {
        controller = undefined;
        setBusy(false);
      }
    }
  }
  const [language, setLanguage] = createSignal<'en' | 'vi'>(
    readPreference('language') === 'vi' ? 'vi' : 'en',
  );
  createEffect(() => writePreference('language', language()));
  const [prior] = createResource(
    () => (route().startsWith('/history/') && institution() ? {id:route().split('/')[2]!,cursor:historyCursor()} : false),
    (key) =>
      get(
        scoped(institution(), '/conversations/{conversation_id}/answers', { conversation_id: key.id })+pageSuffix(key.cursor),
        'AnswerPage',
      ),
  );
  const form = () => (
    <form class="composer" onSubmit={ask}>
      <label for="question">Your question</label>
      <textarea
        id="question"
        ref={composer}
        maxLength={4000}
        value={draft()}
        onInput={(e) => updateDraft(e.currentTarget.value)}
        placeholder={
          language() === 'vi' ? 'Bạn muốn tìm hiểu điều gì?' : 'What would you like to know?'
        }
        required
      />
      <div class="composer-tools">
        <select
          aria-label="Answer language"
          value={language()}
          onChange={(e) => setLanguage(e.currentTarget.value as 'en' | 'vi')}
        >
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </select>
        <Show
          when={busy()}
          fallback={
            <button class="primary" type="submit" title="Ask noti.school">
              Ask <ArrowUp size={18} />
            </button>
          }
        >
          <button type="button" onClick={() => cancel()}>
            <X size={18} /> Cancel
          </button>
        </Show>
      </div>
    </form>
  );
  return (
    <>
      <a
        class="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <header>
        <a class="wordmark" href="#/">
          noti<span> school</span>
          <span class="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#/sources">
            <BookOpen size={17} />
            Sources
          </a>
          <a href="#/history">
            <History size={17} />
            History
          </a>
          <a href="#/auth">
            <LogIn size={17} />
            {me() ? 'Account' : 'Sign in'}
          </a>
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Show when={route() === '/' || transitioning()}>
          <section
            class="hero"
            classList={{ leaving: route() !== '/' }}
            aria-hidden={route() !== '/'}
            inert={route() !== '/'}
          >
            <Archive paused={paused()} zoom={zoom()} />
            <div class="hero-content">
              <div class="institution">
                <School size={17} />
                <label class="sr-only" for="institution">
                  Institution
                </label>
                <select
                  id="institution"
                  value={institution()}
                  onChange={(e) => {
                    cancel(false);
                    setInstitution(e.currentTarget.value);
                    setAnswer(undefined);
                  }}
                >
                  <Show
                    when={institutions()?.items.length}
                    fallback={<option value="">HCMIU · coverage unavailable</option>}
                  >
                    <For each={institutions()?.items}>
                      {(item: Institution) => (
                        <option value={item.id}>
                          {item.name}
                          {item.coverage === 'synthetic_demo' ? ' · Demo' : ''}
                        </option>
                      )}
                    </For>
                  </Show>
                </select>
              </div>
              <h1 tabIndex={-1}>noti.school</h1>
              <p class="promise">
                Your university questions,
                <br class="mobile-break" /> answered with sources.
              </p>
              <Show when={route() === '/'}>{form()}</Show>
              <div class="suggestions">
                <span>Start with a question</span>
                <For
                  each={[
                    'Where can I find the student handbook?',
                    'How do I find the right course form?',
                    'Tôi có thể tìm quy chế học vụ ở đâu?',
                  ]}
                >
                  {(question) => (
                    <button
                      onClick={() => {
                        updateDraft(draft() ? `${draft()}\n${question}` : question);
                        composer.focus();
                      }}
                    >
                      {question}
                      <ArrowUpRight size={15} />
                    </button>
                  )}
                </For>
              </div>
              <p class="coverage">
                {selected()?.coverage === 'approved_sources'
                  ? 'Approved sources available'
                  : selected()?.coverage === 'synthetic_demo'
                    ? 'Demo collection · synthetic examples only'
                    : 'Pilot collection · source coverage not yet confirmed'}
              </p>
              <Show when={error()}>
                <p role="alert" class="error">
                  {error()}
                </p>
              </Show>
            </div>
            <button
              class="motion-control"
              title={paused() ? 'Resume animation' : 'Pause animation'}
              aria-label={paused() ? 'Resume animation' : 'Pause animation'}
              aria-pressed={paused()}
              onClick={() => setPaused((v) => !v)}
            >
              {paused() ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </section>
          <section class="collection-preview">
            <div>
              <span class="section-number">01 / The collection</span>
              <h2>Go straight to the source.</h2>
              <p>Find the document. Check the version. Read it for yourself.</p>
            </div>
            <a class="text-link" href="#/sources">
              Explore sources <ArrowUpRight size={20} />
            </a>
          </section>
          <CollectionPreview institution={institution()} />
          <section class="university">
            <School size={26} />
            <h2>Reconnect with your students.</h2>
            <p>A clearer way to share your institution’s knowledge.</p>
            <a href="#/admin">
              Manage your collection <ArrowUpRight size={17} />
            </a>
          </section>
        </Show>
        <Show when={route() === '/answer'}>
          <div class="workspace">
            <div class="answer-column">
              <a href="#/" class="back">
                ← New question
              </a>
              <h1 id="answer-heading" tabIndex={-1}>
                Your answer
              </h1>
              <p class="muted">
                {selected()?.name}
                {demo() ? ' · Demo' : ''}
              </p>
              <Show when={busy()}>
                <div role="status" class="loading">
                  <span class="skeleton" />
                  Finding an answer and its sources…
                </div>
              </Show>
              <Show when={error()}>
                <div class="notice" role="alert">
                  <p>{error()}</p>
                  <a href="#/auth">Sign in</a> · <a href="#/sources">Browse sources</a>
                </div>
              </Show>
              <Show when={answer()}>
                {(a) => (
                  <>
                    <p class="answer-status">
                      {a().status === 'abstained'
                        ? 'Not enough evidence'
                        : a().status === 'qualified'
                          ? 'Answer with limitations'
                          : 'Answer with sources'}
                    </p>
                    <For each={a().claims}>
                      {(claim) => (
                        <p class="claim">
                          {claim.text}
                          <span class="citation-buttons">
                            <For each={claim.evidence_ids}>
                              {(id) => (
                                <button
                                  title="Open source citation"
                                  onClick={() => setCitation(id)}
                                >
                                  <BookOpen size={14} />
                                  {a().evidence.findIndex((e) => e.id === id) + 1}
                                </button>
                              )}
                            </For>
                          </span>
                        </p>
                      )}
                    </For>
                    <Show when={a().explanation}>
                      <p class="notice">{a().explanation}</p>
                    </Show>
                    <button onClick={() => setFeedback((v) => !v)}>
                      <MessageSquare size={16} />
                      Report an issue
                    </button>
                    <Show when={feedback()}>
                      <form
                        class="stack"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          setFeedbackMessage('Sending…');
                          try {
                            await post(scoped(institution(), '/feedback'), 'Feedback', {
                              answer_id: a().id,
                              category: data.get('category'),
                              comment: data.get('comment'),
                            });
                            setFeedbackMessage('Feedback received. Thank you.');
                          } catch (err) {
                            setFeedbackMessage(errorText(err));
                          }
                        }}
                      >
                        <label>
                          Issue
                          <select name="category">
                            <option value="unsupported">Unsupported claim</option>
                            <option value="incorrect">Incorrect</option>
                            <option value="outdated">Outdated</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                        <label>
                          Comment
                          <textarea name="comment" maxLength={2000} />
                        </label>
                        <button type="submit">Send feedback</button>
                        <p role="status">{feedbackMessage()}</p>
                      </form>
                    </Show>
                  </>
                )}
              </Show>
              <h2>Ask a follow-up</h2>
              {form()}
            </div>
            <aside>
              <h2>Supporting sources</h2>
              <Show
                when={answer()?.evidence.length}
                fallback={<p class="muted">Sources will appear with the answer.</p>}
              >
                <For each={answer()?.evidence}>
                  {(e) => (
                    <button class="source-citation" onClick={() => setCitation(e.id)}>
                      <BookOpen size={18} />
                      <span>
                        {e.title}
                        <small>
                          {e.version_label} ·{' '}
                          {e.locator.page ? `Page ${e.locator.page}` : e.locator.section}
                        </small>
                      </span>
                    </button>
                  )}
                </For>
              </Show>
              <Show when={citation()}>
                <Sources institution={institution()} citation={citation()} />
              </Show>
            </aside>
          </div>
        </Show>
        <Show when={route().startsWith('/sources')}>
          <div class="page">
            <Sources institution={institution()} source={route().split('/')[2] || ''} />
          </div>
        </Show>
        <Show when={route().startsWith('/auth') ? authCallback() : undefined} keyed>
          <div class="page">
            <Auth
              callback={authCallback()}
              capabilities={capabilities()}
              authenticated={!!me()}
              refresh={() => { void refreshMe(); void refreshCapabilities(); }}
            />
          </div>
        </Show>
        <Show when={route().startsWith('/admin')}>
          <div class="page">
            <Admin
              institution={institution()}
              allowed={
                !me.loading && (me()?.memberships.some(
                  (m) => m.institution_id === institution() && m.role === 'admin',
                ) ?? false)
              }
            />
          </div>
        </Show>
        <Show when={route().startsWith('/history')}>
          <div class="page">
            <h1 tabIndex={-1}>Your conversations</h1>
            <p class="muted">Saved conversations for this institution. Sign in to read them.</p>
            <Show when={history.loading}><p role="status">Loading saved conversations…</p></Show>
            <Show when={history.error}><p role="alert">{errorText(history.error)}</p></Show>
            <For each={visibleHistory()?.items} fallback={<Show when={!history.loading && !history.error}><p>No saved conversations available.</p></Show>}>
              {(row) => (
                <a
                  class="list-row"
                  href={`#/history/${row.id}`}
                  onClick={() => setInstitution(row.institution_id)}
                >
                  Open conversation <ArrowUpRight size={17} />
                </a>
              )}
            </For>
            <Pagination cursor={listCursor()} next={visibleHistory()?.next_cursor} change={setListCursor} label="History pages"/>
            <Show when={prior.loading}>
              <p role="status">Loading conversation…</p>
            </Show>
            <Show when={prior.error}>
              <p role="alert">{errorText(prior.error)}</p>
            </Show>
            <For each={prior()?.items}>
              {(a) => (
                <button
                  class="list-row"
                  onClick={() => {
                    setAnswer(readAnswer(a));
                    setConversation({id:a.conversation_id,institution:a.institution_id});
                    location.hash = '/answer';
                  }}
                >
                  View answer · {new Date(a.created_at).toLocaleDateString()}
                </button>
              )}
            </For>
            <Show when={prior()}>
              <Pagination cursor={historyCursor()} next={prior()?.next_cursor} change={setHistoryCursor} label="Conversation pages"/>
              <button
                onClick={async () => {
                  if (!confirm('Delete this conversation?')) return;
                  try {
                    await request(
                      scoped(institution(), '/conversations/{conversation_id}', {
                        conversation_id: route().split('/')[2]!,
                      }),
                      null,
                      { method: 'DELETE' },
                    );
                    await refreshHistory();
                    location.hash = '/history';
                  } catch (e) {
                    setError(errorText(e));
                  }
                }}
              >
                Delete conversation
              </button>
              <Show when={error()}>
                <p role="alert">{error()}</p>
              </Show>
            </Show>
          </div>
        </Show>
        <Show
          when={
            !/^\/(?:$|answer$|sources(?:\/|$)|auth(?:\/|$)|admin(?:\/|$)|history(?:\/|$))/.test(
              route().split('?')[0]!,
            )
          }
        >
          <div class="page">
            <h1 tabIndex={-1}>Page not found</h1>
            <a href="#/">Return to your question</a>
          </div>
        </Show>
      </main>
      <footer>
        <a href="#/">noti.school</a>
        <span>Independent HCMIU pilot · No official affiliation claimed</span>
        <a href="#/admin">
          For institutions <ExternalLink size={14} />
        </a>
      </footer>
    </>
  );
}
function historyReplace(path: string) {
  window.history.replaceState(null, '', `#${path}`);
}

function readPreference(key: string) {
  try {
    return sessionStorage.getItem(`noti.${key}`) || '';
  } catch {
    return '';
  }
}
function writePreference(key: string, value: string) {
  try {
    sessionStorage.setItem(`noti.${key}`, value);
  } catch {
    /* Optional tab storage. */
  }
}
