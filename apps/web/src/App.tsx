import {
  batch,
  createComputed,
  createEffect,
  createMemo,
  createSignal,
  ErrorBoundary,
  lazy,
  Show,
  onCleanup,
  untrack,
} from 'solid-js';
import { createRemoteResource as createResource, accessScope, setAccessScope } from './resource';
import type { AnswerOutput } from '@noti/contracts';
import {
  get,
  post,
  request,
  readAnswer,
  errorText,
  loadDraft,
  saveDraft,
  loadDraftConversation,
  endpoint,
  loadContracts,
  takeAuthCallback,
  operationKey,
  clearOperations,
  retainOperations,
  requestScope,
  RequestError,
} from './api';
import { isWorkspaceRoute, PilotNotice, SiteHeader, SiteFooter } from './site/SiteShell';
import { isSiteRoute, parseHash, sitePages, type LandingSection } from './site/routes';
import { siteCommands } from './site/commands';
import { Landing } from './landing/Landing';
import { coverageText, heroLabel, membershipInstitution, schoolOptions } from './landing/logic';
import { Button, CommandMenu, EmptyState, looksVietnamese, PromptInput, Toaster, useCommandMenu } from './ui';
import RefreshCw from 'lucide-solid/icons/refresh-cw';
import './site/site.scss';
import { pageSuffix } from './Pagination';
import { AnswerView } from './app/AnswerView';
import { deriveInstitutions, deriveSession, type InstitutionsState, type SessionState } from './app/session';
import page from './app/Page.module.scss';
const institutionPath = '/api/v1/institutions/{institution_id}';
export const scoped = (institution: string, suffix: string, params: Record<string, string> = {}) =>
  endpoint(`${institutionPath}${suffix}`, { institution_id: institution, ...params });

// Routes other than the landing and the answer page load on demand, so the first paint of #/ ships none of their code.
const Sources = lazy(() => import('./Sources'));
const Auth = lazy(() => import('./Auth'));
const Admin = lazy(() => import('./Admin'));
const HistoryView = lazy(() => import('./app/HistoryView').then((module) => ({ default: module.HistoryView })));
const MarketingPages = lazy(() => import('./site/MarketingPages'));

/** Loads the code a route renders; resolves at once for routes in the initial bundle. */
export function preloadRoute(route: string): Promise<unknown> {
  if (route === '/answer' || route.startsWith('/sources')) return Sources.preload();
  if (route.startsWith('/auth')) return Auth.preload();
  if (route.startsWith('/admin')) return Admin.preload();
  if (route.startsWith('/history')) return HistoryView.preload();
  if (isSiteRoute(route) && route !== '/') return MarketingPages.preload();
  return Promise.resolve();
}

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
  const [route, setRoute] = createSignal(parseHash(location.hash).route);
  // A landing anchor such as #how renders the landing and scrolls to that section.
  const [section, setSection] = createSignal<LandingSection | ''>(parseHash(location.hash).section);
  const hash = () => {
    setAuthCallback(readCallback());
    setWaitSince(Date.now());
    const next = parseHash(location.hash);
    batch(() => {
      setRoute(next.route);
      setSection(next.section);
    });
    void refreshCapabilities();
    void refreshMe();
    cancel(false);
    if (route() === '/') {
      setAnswer(undefined);
      setConversation(undefined);
      saveDraft(draft(), draftOwner);
    }
    setHistoryCursor('');
  };
  window.addEventListener('hashchange', hash);
  onCleanup(() => window.removeEventListener('hashchange', hash));
  const [capabilities, { refetch: refreshCapabilities }] = createResource(() =>
    get('/api/v1/capabilities', 'Capabilities'),
  );
  const [institutions] = createResource(() => get('/api/v1/institutions', 'InstitutionPage'));
  const [me, { refetch: refreshMe, mutate: setMe }] = createResource(() => get('/api/v1/me', 'Me'));
  // Unknown is not "no": until identity and the school list settle, views render loading, never signed out or unavailable.
  const session = createMemo<SessionState>(
    (previous) => deriveSession({ loading: me.loading, present: !!me(), failed: identityOutage(me.error) }, previous),
    'loading',
  );
  const institutionsState = createMemo<InstitutionsState>(
    (previous) =>
      deriveInstitutions({ loading: institutions.loading, present: !!institutions()?.items.length }, previous),
    'loading',
  );
  // When the visitor started waiting on this route, so regions remounted by a scope change keep their skeleton.
  const [waitSince, setWaitSince] = createSignal(Date.now());
  const revalidate = () => {
    if (document.visibilityState === 'visible') void refreshMe();
  };
  window.addEventListener('focus', revalidate);
  document.addEventListener('visibilitychange', revalidate);
  onCleanup(() => {
    window.removeEventListener('focus', revalidate);
    document.removeEventListener('visibilitychange', revalidate);
  });
  const [institution, setInstitution] = createSignal('');
  createEffect(() => {
    const first = institutions()?.items[0];
    if (first && !institution()) {
      const saved = readPreference('institution');
      setInstitution(institutions()?.items.some((i) => i.id === saved) ? saved : first.id);
    }
  });
  const selected = () => institutions()?.items.find((i) => i.id === institution());
  // Signed-in accounts ask about their own school; signed-out visitors see the listed pilot institutions.
  createEffect(() => {
    const own = membershipInstitution(institution(), institutions()?.items ?? [], me()?.memberships);
    if (own && own !== institution()) setInstitution(own);
  });
  const schools = () => schoolOptions(institutions()?.items ?? [], me()?.memberships);
  const demo = () => capabilities()?.mode === 'mock' || selected()?.coverage === 'synthetic_demo';
  // Workspace data waits for identity, the school list and the access scope derived from both.
  const workspacePending = () =>
    session() === 'loading' ||
    institutionsState() === 'loading' ||
    (institutionsState() === 'ready' && accessScope() === 'initial');
  createEffect(() => {
    if (institution()) writePreference('institution', institution());
  });
  const [draft, setDraft] = createSignal('');
  const updateDraft = (text: string) => {
    setDraft(text);
    saveDraft(text, draftOwner, conversation());
  };
  const [paused, setPaused] = createSignal(readPreference('motion-paused') === 'true');
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const [reduced, setReduced] = createSignal(motionQuery.matches);
  const motionChange = () => setReduced(motionQuery.matches);
  motionQuery.addEventListener('change', motionChange);
  onCleanup(() => motionQuery.removeEventListener('change', motionChange));
  const [visible, setVisible] = createSignal(document.visibilityState === 'visible');
  const visibility = () => setVisible(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', visibility);
  onCleanup(() => document.removeEventListener('visibilitychange', visibility));
  const siteMotion = () => !paused() && !reduced() && visible();
  createEffect(() => writePreference('motion-paused', String(paused())));
  // Portalled layers (sheet, menus, toasts) live outside the shell, so the pause preference is mirrored on <html>.
  createEffect(() => (document.documentElement.dataset.motion = siteMotion() ? 'on' : 'off'));
  let composer: HTMLTextAreaElement | undefined;
  let picker: HTMLElement | undefined;
  // Runs once the landing has rendered, instead of the default heading focus (command menu and "/" actions).
  let afterHome: (() => void) | undefined;
  const revealComposer = () => {
    if (!composer?.isConnected) return;
    composer.focus({ preventScroll: true });
    composer.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  };
  const revealSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };
  const onHome = (action: () => void) => {
    if (route() === '/') action();
    else {
      afterHome = action;
      location.hash = '/';
    }
  };
  const focusAsk = () => (route() === '/answer' ? revealComposer() : onHome(revealComposer));
  const navigate = (href: string) => {
    if (location.hash === href || (href === '#/' && route() === '/' && !section())) {
      const target = parseHash(href);
      if (target.section) revealSection(target.section);
      else onHome(revealComposer);
    } else location.hash = href;
  };
  createEffect(() => {
    const current = route();
    const target = section();
    const marketing = isSiteRoute(current) ? sitePages[current] : undefined;
    const appTitle = current.startsWith('/sources')
      ? 'Sources'
      : current.startsWith('/history')
        ? 'History'
        : current.startsWith('/auth')
          ? 'Account'
          : current.startsWith('/admin')
            ? 'Collection administration'
            : current === '/answer'
              ? 'Your answer'
              : 'Page not found';
    document.title = `${marketing?.[0] || appTitle} · noti.school`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        marketing?.[1] || 'Your noti.school workspace for questions, sources and account access.',
      );
    // A lazily loaded route renders when its chunk arrives; focus its heading after that, not before.
    void preloadRoute(current).then(() => queueMicrotask(() => {
      if (route() !== current) return;
      const pending = afterHome;
      afterHome = undefined;
      if (target) return revealSection(target);
      const heading = document.querySelector<HTMLElement>('main h1, main h2');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      if (pending && current === '/') pending();
    }));
  });
  const [busy, setBusy] = createSignal(false),
    [error, setError] = createSignal(''),
    // RequestError code of the last ask failure ('cancelled' after Stop), so outages render as the unavailable state.
    [errorCode, setErrorCode] = createSignal<string>(),
    [answer, setAnswer] = createSignal<AnswerOutput>(),
    // The question behind the answer on screen, echoed above it; empty for answers opened from history.
    [asked, setAsked] = createSignal('');
  const [citation, setCitation] = createSignal('');
  const [conversation, setConversation] = createSignal<{ id: string; institution: string }>();
  const [historyCursor, setHistoryCursor] = createSignal('');
  const [feedback, setFeedback] = createSignal(false),
    [feedbackMessage, setFeedbackMessage] = createSignal('');
  const [listCursor, setListCursor] = createSignal('');
  const [history, { refetch: refreshHistory }] = createResource(
    () =>
      route().startsWith('/history') && institution() && member()
        ? { institution: institution(), cursor: listCursor(), user: me()!.identity.user_id }
        : false,
    async (key) => ({
      ...(await get(
        scoped(key.institution, '/conversations') + pageSuffix(key.cursor),
        'ConversationPage',
      )),
      owner: key.user,
      institution: key.institution,
    }),
  );
  const visibleHistory = () =>
    history()?.owner === me()?.identity.user_id && history()?.institution === institution()
      ? history()
      : undefined;
  const admin = () =>
    me()?.memberships.some((m) => m.institution_id === institution() && m.role === 'admin') ?? false;
  function member() {
    return me()?.memberships.some((m) => m.institution_id === institution());
  }
  // The workspace names the school of the signed-in membership only; signed-out visitors see no school name.
  const memberSchool = () =>
    member() ? institutions()?.items.find((i) => i.id === institution())?.name : undefined;
  const [deleting, setDeleting] = createSignal(false);
  let draftOwner = 'anonymous';
  let initialized = false;
  let controller: AbortController | undefined;
  createComputed(() => {
    if (!institution() || (me.loading && !me())) return;
    const user = me()?.identity.user_id;
    const memberships =
      me()
        ?.memberships.map((m) => `${m.institution_id}:${m.role}`)
        .sort() || [];
    const anonymous = `anonymous:${institution()}`;
    const owner = user ? JSON.stringify([user, institution(), memberships]) : anonymous;
    const scope = JSON.stringify([owner, institution()]);
    untrack(() => {
      if (scope === accessScope()) return;
      cancel(false);
      const adopt = (draftOwner === 'anonymous' || draftOwner === anonymous) && !!user;
      const nextDraft = !initialized
        ? draft() || loadDraft(owner, adopt ? anonymous : undefined)
        : adopt
          ? draft()
          : '';
      const restoredConversation =
        !initialized && route() === '/answer' ? loadDraftConversation(owner) : undefined;
      if (initialized) {
        clearOperations();
        clearAuthCallback();
      } else retainOperations(scope);
      draftOwner = owner;
      initialized = true;
      setDraft(nextDraft);
      saveDraft(nextDraft, owner, restoredConversation);
      setAnswer(undefined);
      setAsked('');
      setConversation(restoredConversation);
      setCitation('');
      setError('');
      setFeedback(false);
      setFeedbackMessage('');
      setListCursor('');
      setHistoryCursor('');
      setAccessScope(scope);
    });
  });
  function clearAuthCallback() {
    const callback = authCallback();
    if (callback) setAuthCallback({ ...callback, token: '', deletion: '', error: false });
  }
  function signedOut() {
    cancel(false);
    clearOperations();
    setDraft('');
    setMe(undefined);
    clearAuthCallback();
    setAnswer(undefined);
    setAsked('');
    setConversation(undefined);
    setCitation('');
    setFeedback(false);
    setFeedbackMessage('');
    setError('');
    setListCursor('');
    setHistoryCursor('');
    draftOwner = `anonymous:${institution()}`;
    setAccessScope(JSON.stringify([draftOwner, institution()]));
  }
  function cancel(announce = true) {
    if (controller) {
      controller.abort();
      controller = undefined;
      setBusy(false);
      if (announce) {
        setError(
          'Stopped waiting. Processing may continue. Submit the same question to check the same operation.',
        );
        setErrorCode('cancelled');
      }
    }
  }
  onCleanup(() => cancel(false));
  async function ask(event?: SubmitEvent) {
    event?.preventDefault();
    // Already loaded by the start-up requests; awaiting a settled import keeps rapid double submits ordered.
    let contracts: Awaited<ReturnType<typeof loadContracts>>;
    try {
      contracts = await loadContracts();
    } catch {
      setError('Part of the app did not download. Check your connection, then reload the page.');
      setErrorCode('unavailable');
      return;
    }
    const { AskRequest, QUESTION_MAX_BYTES, QUESTION_MAX_CHARACTERS } = contracts;
    if (busy() || accessScope() === 'initial') return;
    setError('');
    setErrorCode(undefined);
    setCitation('');
    setFeedback(false);
    if (!institution()) {
      setError('The institution list is unavailable. Please try again later.');
      return;
    }
    const previous = conversation();
    const parsed = AskRequest.safeParse({
      institution_id: institution(),
      question: draft(),
      language: language(),
      ...(previous?.institution === institution() ? { conversation_id: previous.id } : {}),
      discover: false,
    });
    if (
      !parsed.success ||
      !draft().trim() ||
      new TextEncoder().encode(draft()).length > QUESTION_MAX_BYTES ||
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(draft())
    ) {
      setError(
        `Enter 1 to ${QUESTION_MAX_CHARACTERS.toLocaleString('en')} Unicode characters, at most ${QUESTION_MAX_BYTES.toLocaleString('en')} UTF-8 bytes. Only tab and line breaks are allowed as control characters.`,
      );
      return;
    }
    setBusy(true);
    setAnswer(undefined);
    setAsked(parsed.data.question);
    const active = new AbortController();
    controller = active;
    saveDraft(draft(), draftOwner, previous);
    const owner = accessScope();
    let key: string;
    try {
      key = await operationKey(owner, parsed.data, active.signal);
    } catch {
      if (controller === active) {
        controller = undefined;
        setBusy(false);
      }
      return;
    }
    if (active.signal.aborted || owner !== accessScope()) return;
    // The request starts immediately. No automatic retries of paid work.
    const pending = post('/api/v1/answers', 'Answer', parsed.data, {
      signal: active.signal,
      headers: { 'Idempotency-Key': key },
    });
    setRoute('/answer');
    setSection('');
    historyReplace('/answer');
    queueMicrotask(() => document.getElementById('answer-heading')?.focus());
    try {
      const result = await readAnswer(await pending);
      if (active.signal.aborted || owner !== accessScope() || controller !== active) return;
      if (result.institution_id !== institution()) throw new Error('Scope mismatch');
      setAnswer(result);
      setConversation({ id: result.conversation_id, institution: result.institution_id });
      // The question is answered and echoed above the answer; an empty composer prevents resending it by accident.
      updateDraft('');
    } catch (e) {
      if (!active.signal.aborted && owner === accessScope() && controller === active) {
        setError(errorText(e));
        setErrorCode(e instanceof RequestError ? e.code : undefined);
      }
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
    () =>
      /^\/history\/[^/]+$/.test(route()) && institution() && member()
        ? {
            id: route().split('/')[2]!,
            cursor: historyCursor(),
            institution: institution(),
            owner: accessScope(),
          }
        : false,
    async (key) => {
      const page = await get(
        scoped(key.institution, '/conversations/{conversation_id}/answers', {
          conversation_id: key.id,
        }) + pageSuffix(key.cursor),
        'AnswerPage',
      );
      if (
        page.items.some((a) => a.institution_id !== key.institution || a.conversation_id !== key.id)
      )
        throw new Error('Scope mismatch');
      return { ...page, items: await Promise.all(page.items.map(readAnswer)) };
    },
  );
  const followUp = () => (
    <PromptInput
      value={draft()}
      onInput={updateDraft}
      onSubmit={() => void ask()}
      pending={busy()}
      language={language()}
      onLanguage={setLanguage}
      placeholder={language() === 'vi' ? 'Hỏi tiếp về câu trả lời này' : 'Ask a follow-up about this answer'}
      textareaRef={(element) => (composer = element)}
    />
  );
  const commandMenu = useCommandMenu();
  // "/" focuses the question box when the visitor is not typing somewhere else.
  const slash = (event: KeyboardEvent) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)))
      return;
    if (commandMenu.open() || (route() !== '/' && route() !== '/answer')) return;
    event.preventDefault();
    focusAsk();
  };
  window.addEventListener('keydown', slash);
  onCleanup(() => window.removeEventListener('keydown', slash));
  const fillQuestion = (text: string) => {
    updateDraft(text);
    if (looksVietnamese(text)) setLanguage('vi');
    focusAsk();
  };
  const commands = () =>
    siteCommands({
      language: language(),
      signedIn: !!me(),
      focusAsk,
      fillQuestion,
      navigate,
      toggleLanguage: () => setLanguage((value) => (value === 'en' ? 'vi' : 'en')),
      openSchoolPicker: () => onHome(() => picker?.querySelector('button')?.click()),
    });
  return (
    <div
      class="app-shell"
      data-motion={siteMotion() ? 'on' : 'off'}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const link = event.target instanceof Element ? event.target.closest('a') : null;
        const href = link?.getAttribute('href');
        // A same-hash link emits no route change; still return to the primary task or the section.
        if (!href || (href !== `#${route()}` && href !== location.hash)) return;
        event.preventDefault();
        if (section() || href !== `#${route()}`) return navigate(href);
        if (route() === '/') return revealComposer();
        document.querySelector<HTMLElement>('main h1, main h2')?.focus({ preventScroll: true });
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      }}
    >
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
      {/* Marketing chrome: hidden on workspace routes by route, not by identity, so resolving Me never shifts the page. */}
      <PilotNotice hidden={isWorkspaceRoute(route())} />
      <SiteHeader route={route()} session={session()} admin={admin()} onSearch={() => commandMenu.setOpen(true)} />
      <main id="main" tabIndex={-1}>
        {/* Route chunks load lazily; a failed fetch shows a reload notice instead of an empty main. */}
        <ErrorBoundary fallback={() => <RouteLoadError />}>
        <Show when={route() === '/'}>
          <Landing
            draft={draft()}
            onDraft={updateDraft}
            onSubmit={() => void ask()}
            pending={busy()}
            language={language()}
            onLanguage={setLanguage}
            schools={schools()}
            institution={institution()}
            onSchool={(id) => {
              cancel(false);
              setInstitution(id);
              setAnswer(undefined);
            }}
            schoolFallback="HCMIU pilot"
            schoolLabel={heroLabel(selected()?.name, selected()?.slug)}
            coverage={
              institutions.loading && !institutions()
                ? 'Checking which schools are available…'
                : coverageText(selected()?.coverage)
            }
            error={error()}
            textareaRef={(element) => (composer = element)}
            pickerRef={(element) => (picker = element)}
            motion={siteMotion()}
            onFocusAsk={focusAsk}
          />
        </Show>
        <Show
          when={
            isSiteRoute(route()) && route() !== '/'
              ? (route() as Exclude<keyof typeof sitePages, '/'>)
              : undefined
          }
          keyed
        >
          {(page) => <MarketingPages route={page} motion={siteMotion()} />}
        </Show>
        <Show when={route() === '/answer'}>
          <AnswerView
            question={asked()}
            school={memberSchool()}
            session={session()}
            schoolPending={
              session() === 'loading' ||
              (session() === 'signed-in' && institutionsState() === 'loading') ||
              (capabilities.loading && !capabilities())
            }
            demo={demo()}
            busy={busy()}
            error={error()}
            errorCode={errorCode()}
            answer={answer()}
            citation={citation()}
            onCitation={setCitation}
            onStop={() => cancel()}
            onRephrase={revealComposer}
            feedbackOpen={feedback()}
            onFeedbackToggle={() => setFeedback((v) => !v)}
            feedbackMessage={feedbackMessage()}
            onFeedbackMessage={setFeedbackMessage}
            institution={institution()}
            composer={followUp()}
            reader={
              <Show when={citation()}>
                <Show when={accessScope()} keyed>
                  {(_scope) => <Sources institution={institution()} citation={citation()} />}
                </Show>
              </Show>
            }
          />
        </Show>
        <Show when={route().startsWith('/sources')}>
          <div class={page.page}>
            <Show when={accessScope()} keyed>
              {(_scope) => (
                <Sources
                  institution={institution()}
                  source={route().split('/')[2] || ''}
                  pending={workspacePending()}
                  unavailable={institutionsState() === 'unavailable'}
                  since={waitSince()}
                />
              )}
            </Show>
          </div>
        </Show>
        <Show when={route().startsWith('/auth') ? authCallback() : undefined} keyed>
          <div class={page.page}>
            <Show when={accessScope()} keyed>
              {(_scope) => (
                <Auth
                  callback={authCallback()}
                  capabilities={capabilities()}
                  authenticated={!!me()}
                  identityUnavailable={session() === 'unavailable'}
                  refresh={() => {
                    void refreshMe();
                    void refreshCapabilities();
                  }}
                  signedOut={signedOut}
                />
              )}
            </Show>
          </div>
        </Show>
        <Show when={route().startsWith('/admin')}>
          <div class={page.page}>
            <Show when={accessScope()} keyed>
              {(_scope) => (
                <Admin
                  institution={institution()}
                  pending={workspacePending()}
                  since={waitSince()}
                  allowed={admin()}
                  identityUnavailable={session() === 'unavailable'}
                />
              )}
            </Show>
          </div>
        </Show>
        <Show when={route().startsWith('/history')}>
          <div class={page.page}>
            <HistoryView
              session={session()}
              pending={workspacePending()}
              member={!!member()}
              rows={visibleHistory()?.items}
              rowsLoading={history.loading}
              rowsError={history.error ? errorText(history.error) : ''}
              listCursor={listCursor()}
              listNext={visibleHistory()?.next_cursor}
              onListCursor={setListCursor}
              onOpen={(row) => setInstitution(row.institution_id)}
              detail={/^\/history\/[^/]+$/.test(route())}
              answers={prior()?.items}
              answersLoading={prior.loading}
              answersError={prior.error ? errorText(prior.error) : ''}
              answerCursor={historyCursor()}
              answerNext={prior()?.next_cursor}
              onAnswerCursor={setHistoryCursor}
              onView={async (a) => {
                const viewed = await readAnswer(a);
                setAsked('');
                setAnswer(viewed);
                setConversation({ id: a.conversation_id, institution: a.institution_id });
                location.hash = '/answer';
              }}
              onDelete={async () => {
                if (deleting() || !confirm('Delete this conversation?')) return;
                const owner = requestScope(),
                  path = route();
                setDeleting(true);
                try {
                  await request(
                    scoped(institution(), '/conversations/{conversation_id}', {
                      conversation_id: route().split('/')[2]!,
                    }),
                    null,
                    { method: 'DELETE' },
                  );
                  if (owner.aborted || path !== route()) return;
                  await refreshHistory();
                  if (owner.aborted || path !== route()) return;
                  location.hash = '/history';
                } catch (e) {
                  if (!owner.aborted && path === route()) {
                    setError(errorText(e));
                    setErrorCode(undefined);
                  }
                } finally {
                  setDeleting(false);
                }
              }}
              deleting={deleting()}
              error={error()}
              onAsk={focusAsk}
            />
          </div>
        </Show>
        <Show
          when={
            !isSiteRoute(route()) &&
            !/^\/(?:$|answer$|sources(?:\/|$)|auth(?:\/|$)|admin(?:\/|$)|history(?:\/|$))/.test(
              route().split('?')[0]!,
            )
          }
        >
          <div class={page.page}>
            <h1 class={page.title} tabIndex={-1}>
              Page not found
            </h1>
            <p class={page.lede}>This address does not match a page in noti.school.</p>
            <p>
              <a class={page.link} href="#/">
                Return to your question
              </a>
            </p>
          </div>
        </Show>
        </ErrorBoundary>
      </main>
      <SiteFooter route={route()} paused={paused()} reduced={reduced()} toggle={() => setPaused((v) => !v)} />
      <CommandMenu
        open={commandMenu.open()}
        onOpenChange={commandMenu.setOpen}
        items={commands()}
        onFallback={fillQuestion}
      />
      <Toaster />
    </div>
  );
}
/** A failed Me read that is not "not signed in" (401/403) is an outage: the session is unknown, not signed out. */
function identityOutage(error: unknown): boolean {
  if (!error) return false;
  return !(error instanceof RequestError && (error.status === 401 || error.status === 403));
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

// Solid's lazy() keeps a rejected import, so the only reliable recovery is a reload (which also picks up a new deploy).
function RouteLoadError() {
  return (
    <div class="site-wrap" role="alert">
      <EmptyState
        icon={RefreshCw}
        title="This page could not load"
        body="Part of the app did not download. Check your connection, then reload."
        action={<Button onClick={() => location.reload()}>Reload</Button>}
      />
    </div>
  );
}
