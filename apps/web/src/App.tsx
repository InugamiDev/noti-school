import {
  createComputed,
  createEffect,
  createSignal,
  For,
  Show,
  onCleanup,
  untrack,
} from 'solid-js';
import { createRemoteResource as createResource, accessScope, setAccessScope } from './resource';
import {
  ArrowUp,
  ArrowRight,
  Pause,
  Play,
  School,
  X,
} from 'lucide-solid';
import {
  AskRequest,
  QUESTION_MAX_CHARACTERS,
  QUESTION_MAX_BYTES,
  type AnswerOutput,
  type Schemas,
} from '@noti/contracts';
import type { z } from 'zod';
import {
  get,
  post,
  readAnswer,
  errorText,
  loadDraft,
  saveDraft,
  loadDraftConversation,
  endpoint,
  takeAuthCallback,
  operationKey,
  clearOperations,
  retainOperations,
  retireOperation,
  forgetOperations,
  isDefinitiveOutcome,
  isAuthError,
} from './api';
import Archive from './Archive';
import Sources from './Sources';
import Auth from './Auth';
import Admin from './Admin';
import { isSiteRoute, sitePages, SiteHeader, SiteFooter } from './site/SiteShell';
import { ScrollFx, Words, heroIntro } from './site/Flash';
import { t } from './ui/i18n';
import { style, setStyle, scrollTimeline } from './ui/style-flag';
import './ui/glass.css';
import MarketingPages from './site/MarketingPages';
import { HomeSections } from './site/Sections';
import './site/site.css';
import { pageSuffix } from './Pagination';
import AnswerView from './AnswerView';
import DocumentView from './DocumentView';
import History from './History';
import { Select } from './ui/Select';
import type { Turn } from './Thread';
import { detectLanguage, forgetQuestions, questionFor, rememberQuestion } from './questions';
type Institution = z.infer<typeof Schemas.Institution>;
const institutionPath = '/api/v1/institutions/{institution_id}';
export const scoped = (institution: string, suffix: string, params: Record<string, string> = {}) =>
  endpoint(`${institutionPath}${suffix}`, { institution_id: institution, ...params });

// The hash carries a path and an optional query: #/answer/<conversation>?c=<citation>.
// Old or alternative addresses map onto their canonical route so saved links keep working.
const canonical = (path: string) => {
  if (path === '/account') return '/auth';
  const oldDetail = path.match(/^\/history\/([^/]+)$/);
  return oldDetail ? `/answer/${oldDetail[1]}` : path;
};
const readHash = () => {
  const [raw = '/', query = ''] = location.hash.slice(1).split('?');
  const path = canonical(raw || '/');
  return { path, query, redirected: path !== (raw || '/'), fromHistory: /^\/history\/./.test(raw) };
};
const writeHash = (path: string, query: string) =>
  window.history.replaceState(null, '', `#${path}${query ? `?${query}` : ''}`);
const citationParam = (query: string) => {
  const value = new URLSearchParams(query).get('c') ?? '';
  return /^[0-9a-f-]{1,64}$/i.test(value) ? value : '';
};
type NavigateEvent = Event & { navigationType?: string };

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
  const initial = readHash();
  if (initial.redirected) writeHash(initial.path, initial.query);
  const [route, setRoute] = createSignal(initial.path);
  const [query, setQuery] = createSignal(initial.query);
  // Arriving from History gives the workspace an "All conversations" back link.
  const [origin, setOrigin] = createSignal<'home' | 'history'>(initial.fromHistory ? 'history' : 'home');
  const isAnswer = () => route() === '/answer' || route().startsWith('/answer/');
  // Back/forward restores the list position you left; fresh navigation starts at the top.
  const scrollMemory = new Map<string, number>();
  let traversing = false;
  let pendingScroll: number | undefined;
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  const onNavigate = (event: NavigateEvent) => {
    if (event.navigationType === 'traverse') traversing = true;
  };
  navigation?.addEventListener('navigate', onNavigate);
  onCleanup(() => navigation?.removeEventListener('navigate', onNavigate));
  const hash = () => {
    scrollMemory.set(route(), window.scrollY);
    setAuthCallback(readCallback());
    const next = readHash();
    if (next.redirected) writeHash(next.path, next.query);
    if (next.fromHistory) setOrigin('history');
    setRoute(next.path);
    setQuery(next.query);
    void refreshCapabilities();
    void refreshMe();
    cancel(false);
    clearTimeout(transitionTimer);
    setTransitioning(false);
    if (route() === '/') {
      setAnswer(undefined);
      setTurns([]);
      setConversation(undefined);
      saveDraft(draft(), draftOwner);
    }
    setCitation(isAnswer() ? citationParam(next.query) : '');
  };
  window.addEventListener('hashchange', hash);
  onCleanup(() => window.removeEventListener('hashchange', hash));
  // Keyboard: "/" jumps to the question box from anywhere outside a field.
  const shortcuts = (event: KeyboardEvent) => {
    if (event.key !== '/' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable)) return;
    event.preventDefault();
    const box = document.getElementById('question');
    if (box) box.focus();
    else location.hash = '/';
  };
  document.addEventListener('keydown', shortcuts);
  onCleanup(() => document.removeEventListener('keydown', shortcuts));
  const [capabilities, { refetch: refreshCapabilities }] = createResource(() =>
    get('/api/v1/capabilities', 'Capabilities'),
  );
  const [institutions, { refetch: reloadInstitutions }] = createResource(() =>
    get('/api/v1/institutions', 'InstitutionPage'),
  );
  const [me, { refetch: refreshMe, mutate: setMe }] = createResource(() => get('/api/v1/me', 'Me'));
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
  // #/sources/<source>/versions/<version> opens the in-app document reader.
  const documentRoute = () => {
    const parts = route().split('/');
    return parts[1] === 'sources' && parts[3] === 'versions' && parts[2] && parts[4]
      ? { source: parts[2], version: parts[4] }
      : undefined;
  };
  const demo = () => capabilities()?.mode === 'mock' || selected()?.coverage === 'synthetic_demo';
  // Server-reported answer availability. Unavailable blocks Ask; a failed read is shown but the
  // server remains the authority, so asking stays possible.
  const answerState = () => {
    if (capabilities.error)
      return { text: 'Answer availability could not be checked.', blocking: false };
    const answers = capabilities()?.answers;
    if (!answers || answers.state === 'available') return undefined;
    const reasons: Partial<Record<typeof answers.reason, string>> = {
      budget_exhausted: 'Answers are paused for this month.',
      not_configured: 'Answers are not enabled yet.',
      paid_calls_disabled: 'Answers are not enabled yet.',
      pricing_missing: 'Answers are paused until pricing is confirmed.',
      provider_failed: 'Answers are temporarily unavailable.',
      core_failed: 'Answers are temporarily unavailable.',
      no_approved_evidence: 'Answers are waiting for approved sources.',
    };
    return { text: reasons[answers.reason] || 'Answers are unavailable.', blocking: true };
  };
  const answersUnavailable = () => !!answerState()?.blocking;
  const answerNotice = (extra = '') => (
    <Show when={answerState()}>
      {(state) => (
        <p class={`answer-state ${extra}`} role="status">
          <span class="unavailable">{state().text}</span> <a href="#/sources">Browse sources</a>
        </p>
      )}
    </Show>
  );
  createEffect(() => {
    if (institution()) writePreference('institution', institution());
  });
  const [draft, setDraft] = createSignal('');
  const updateDraft = (text: string) => {
    setDraft(text);
    saveDraft(text, draftOwner, conversation());
    if (!languageChosen) {
      const detected = detectLanguage(text);
      if (detected) setLanguage(detected);
    }
  };
  // Set when the visitor picks a language by hand; reset after each question is sent.
  let languageChosen = false;
  const [paused, setPaused] = createSignal(readPreference('motion-paused') === 'true'),
    [zoom, setZoom] = createSignal(0),
    [transitioning, setTransitioning] = createSignal(false);
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const [reduced, setReduced] = createSignal(motionQuery.matches);
  const motionChange = () => setReduced(motionQuery.matches);
  motionQuery.addEventListener('change', motionChange);
  onCleanup(() => motionQuery.removeEventListener('change', motionChange));
  const [visible, setVisible] = createSignal(document.visibilityState === 'visible');
  const visibility = () => setVisible(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', visibility);
  onCleanup(() => document.removeEventListener('visibilitychange', visibility));
  // Workspace pages get a quieter header and a slim footer.
  const appRoute = () => !isSiteRoute(route());
  const siteMotion = () => !paused() && !reduced() && visible();
  // Glass header: CSS scroll-driven animation frosts it where supported; elsewhere a top sentinel
  // and an IntersectionObserver set data-scrolled. No scroll handler either way.
  const [scrolled, setScrolled] = createSignal(false);
  let sentinel: HTMLDivElement | undefined;
  let sentinelObserver: IntersectionObserver | undefined;
  createEffect(() => {
    sentinelObserver?.disconnect();
    sentinelObserver = undefined;
    setScrolled(false);
    if (style() !== 'glass' || scrollTimeline || !sentinel || typeof IntersectionObserver === 'undefined') return;
    sentinelObserver = new IntersectionObserver(([entry]) => setScrolled(!entry?.isIntersecting), { threshold: 0 });
    sentinelObserver.observe(sentinel);
  });
  onCleanup(() => sentinelObserver?.disconnect());
  createEffect(() => writePreference('motion-paused', String(paused())));
  createEffect(() => {
    if (paused() || reduced()) setTransitioning(false);
  });
  createEffect(() => {
    const current = route();
    const marketing = isSiteRoute(current) ? sitePages[current] : undefined;
    const appTitle = current.startsWith('/sources')
      ? 'Sources'
      : current.startsWith('/history')
        ? 'History'
        : current.startsWith('/auth')
          ? 'Account'
          : current.startsWith('/admin')
            ? 'Collection administration'
            : isAnswer()
              ? 'Your answer'
              : 'Page not found';
    document.title = `${marketing?.[0] || appTitle} — noti.school`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        marketing?.[1] || 'Your noti.school workspace for questions, sources and account access.',
      );
    const saved = traversing ? scrollMemory.get(current) : undefined;
    traversing = false;
    queueMicrotask(() => {
      if (route() !== current) return;
      const heading = document.querySelector<HTMLElement>('main h1, main h2');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      // Lists load asynchronously; their saved position is applied once rows exist.
      if (saved && current === '/history') pendingScroll = saved;
      window.scrollTo({ top: saved && current !== '/history' ? saved : 0, left: 0, behavior: 'instant' });
    });
  });
  let transitionTimer: ReturnType<typeof setTimeout> | undefined;
  const [busy, setBusy] = createSignal(false),
    [error, setErrorText] = createSignal(''),
    [authError, setAuthError] = createSignal(false),
    [answer, setAnswer] = createSignal<AnswerOutput>(),
    [turns, setTurns] = createSignal<Turn[]>([]),
    [pendingLanguage, setPendingLanguage] = createSignal<'en' | 'vi'>('en');
  // Only authentication/authorization failures offer sign-in as recovery.
  const setError = (text: string, auth = false) => {
    setErrorText(text);
    setAuthError(auth);
  };
  const [citation, setCitation] = createSignal(isAnswer() ? citationParam(readHash().query) : '');
  // The open citation lives in the URL (?c=) so a reload or shared link reopens the same passage.
  const chooseCitation = (id: string) => {
    setCitation(id);
    if (!isAnswer()) return;
    const next = id ? `c=${id}` : '';
    setQuery(next);
    window.history.replaceState(null, '', `#${route()}${next ? `?${next}` : ''}`);
  };
  const [conversation, setConversation] = createSignal<{ id: string; institution: string }>();
  const [feedback, setFeedback] = createSignal(''),
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
  createEffect(() => {
    if (!visibleHistory()?.items.length || pendingScroll === undefined) return;
    const top = pendingScroll;
    pendingScroll = undefined;
    requestAnimationFrame(() => window.scrollTo({ top, left: 0, behavior: 'instant' }));
  });
  // A deep link or reload at #/answer/<conversation> rebuilds the thread from saved answers.
  const answerConversation = () => (route().startsWith('/answer/') ? route().split('/')[2] : undefined);
  const [restored] = createResource(
    () =>
      answerConversation() && !turns().length && !busy() && institution() && member()
        ? { id: answerConversation()!, institution: institution(), owner: accessScope() }
        : false,
    async (key) => {
      const page = await get(
        scoped(key.institution, '/conversations/{conversation_id}/answers', { conversation_id: key.id }),
        'AnswerPage',
      );
      if (page.items.some((a) => a.institution_id !== key.institution || a.conversation_id !== key.id))
        throw new Error('Scope mismatch');
      return page.items.map(readAnswer);
    },
  );
  createEffect(() => {
    const items = restored();
    const last = items?.at(-1);
    if (!last || untrack(turns).length) return;
    setTurns(items!.map((a) => ({ key: a.id, question: questionFor(a.id), answer: a })));
    setAnswer(last);
    setConversation({ id: last.conversation_id, institution: last.institution_id });
  });
  const restoring = () =>
    !!answerConversation() && !turns().length && !busy() && (restored.loading || (me.loading && !me()));
  const restoreError = () => {
    if (!answerConversation() || turns().length || busy() || restoring()) return '';
    if (restored.error) return errorText(restored.error);
    if (!member()) return 'Sign in with a member account to reopen this conversation.';
    if (restored() && !restored()!.length) return 'This conversation has no answers or was deleted.';
    return '';
  };
  function member() {
    return me()?.memberships.some((m) => m.institution_id === institution());
  }
  let draftOwner = 'anonymous';
  // Account a transient deletion callback is bound to; it survives only that account's scope changes.
  let callbackUser: string | undefined;
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
        !initialized && isAnswer() ? loadDraftConversation(owner) : undefined;
      if (initialized) {
        clearOperations();
        // Keep a deletion callback through the first sign-in in this tab, bound to that account.
        const keepDeletion =
          !!user && (callbackUser === user || (!callbackUser && draftOwner.startsWith('anonymous')));
        clearAuthCallback(keepDeletion);
        callbackUser = keepDeletion ? user : undefined;
      } else {
        retainOperations(scope);
        callbackUser = user;
      }
      const firstScope = !initialized;
      draftOwner = owner;
      initialized = true;
      setDraft(nextDraft);
      saveDraft(nextDraft, owner, restoredConversation);
      setAnswer(undefined);
      setTurns([]);
      setConversation(restoredConversation);
      // A citation named in the URL survives the first scope; account changes clear it.
      if (!firstScope) setCitation('');
      setError('');
      setFeedback('');
      setFeedbackMessage('');
      setListCursor('');
      forgetQuestions();
      setAccessScope(scope);
    });
  });
  function clearAuthCallback(keepDeletion = false) {
    const callback = authCallback();
    if (callback)
      setAuthCallback({
        ...callback,
        token: '',
        deletion: keepDeletion ? callback.deletion : '',
        error: false,
      });
  }
  function signedOut() {
    cancel(false);
    clearOperations();
    setDraft('');
    setMe(undefined);
    clearAuthCallback();
    callbackUser = undefined;
    setAnswer(undefined);
      setTurns([]);
    setConversation(undefined);
    setCitation('');
    setFeedback('');
    setFeedbackMessage('');
    setError('');
    setListCursor('');
    forgetQuestions();
    draftOwner = `anonymous:${institution()}`;
    setAccessScope(JSON.stringify([draftOwner, institution()]));
  }
  let composer!: HTMLTextAreaElement;
  function cancel(announce = true) {
    if (controller) {
      controller.abort();
      controller = undefined;
      setBusy(false);
      // The unanswered question goes back into the box so it can be resubmitted.
      const pending = turns().find((turn) => !turn.answer);
      setTurns((list) => list.filter((turn) => turn.answer));
      if (pending?.question && !draft()) updateDraft(pending.question);
      if (announce)
        setError(
          'Stopped waiting. Processing may continue. Submit the same question to check the same operation.',
        );
    }
  }
  onCleanup(() => {
    cancel(false);
    clearTimeout(transitionTimer);
  });
  async function ask(event: SubmitEvent) {
    event.preventDefault();
    if (busy() || accessScope() === 'initial' || answersUnavailable()) return;
    setError('');
    chooseCitation('');
    setFeedback('');
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
        `Enter 1–${QUESTION_MAX_CHARACTERS.toLocaleString('en')} Unicode characters, at most ${QUESTION_MAX_BYTES.toLocaleString('en')} UTF-8 bytes. Only tab and line breaks are allowed as control characters.`,
      );
      return;
    }
    setBusy(true);
    const question = draft();
    const sameConversation = previous?.institution === institution();
    if (!sameConversation) setTurns([]);
    setAnswer(undefined);
    setPendingLanguage(language());
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
    // The question moves into the thread; the box is free for the next one. A failure puts it back.
    const pendingTurn: Turn = { key: key, question };
    setTurns((list) => [...list, pendingTurn]);
    const followUp = turns().length > 1;
    setDraft('');
    saveDraft('', draftOwner, previous);
    languageChosen = false;
    // The request starts before any visual transition. No automatic retries of paid work.
    const pending = post('/api/v1/answers', 'Answer', parsed.data, {
      signal: active.signal,
      headers: { 'Idempotency-Key': key },
    });
    setTransitioning(!matchMedia('(prefers-reduced-motion: reduce)').matches && !paused());
    setZoom((v) => v + 1);
    // Leaving home adds a history entry, so Back returns to the question box.
    if (!isAnswer()) {
      window.history.pushState(null, '', '#/answer');
      setRoute('/answer');
      setQuery('');
      setOrigin('home');
    }
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => setTransitioning(false), 600);
    queueMicrotask(() => {
      if (!followUp) {
        document.getElementById('answer-heading')?.focus();
        return;
      }
      // A follow-up stays where the reader is: focus and reveal the new question, not the page top.
      const bubble = document.querySelector<HTMLElement>('.turn:last-of-type .turn-question');
      bubble?.focus({ preventScroll: true });
      bubble?.scrollIntoView({ block: 'start', behavior: siteMotion() ? 'smooth' : 'instant' });
    });
    try {
      const response = await pending;
      // A completed response is definitive: "New question" with the same text must not replay it.
      retireOperation(key);
      const result = readAnswer(response);
      if (active.signal.aborted || owner !== accessScope() || controller !== active) return;
      if (result.institution_id !== institution()) throw new Error('Scope mismatch');
      setAnswer(result);
      rememberQuestion(result, question);
      setTurns((list) => list.map((turn) => (turn === pendingTurn ? { ...turn, answer: result } : turn)));
      setConversation({ id: result.conversation_id, institution: result.institution_id });
      // The address now names the conversation, so reload, Back/Forward and sharing reopen it.
      const path = `/answer/${result.conversation_id}`;
      if (isAnswer() && route() !== path) {
        setRoute(path);
        window.history.replaceState(null, '', `#${path}${query() ? `?${query()}` : ''}`);
      }
    } catch (e) {
      // Ambiguous outcomes (stop, disconnect, timeout, conflict) keep the key for an explicit replay.
      if (isDefinitiveOutcome(e)) retireOperation(key);
      if (!active.signal.aborted && owner === accessScope() && controller === active) {
        setError(errorText(e), isAuthError(e));
        setTurns((list) => list.filter((turn) => turn !== pendingTurn));
        if (!draft()) updateDraft(question);
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
  const form = () => (
    <form class="composer" onSubmit={ask} lang={language()}>
      <label for="question">{t(language(), 'yourQuestion')}</label>
      <textarea
        id="question"
        ref={composer}
        aria-describedby="question-limits"
        value={draft()}
        onInput={(e) => updateDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          // Enter asks; Shift+Enter keeps a new line. IME composition (Vietnamese input) is left alone.
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.keyCode === 229)
            return;
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }}
        placeholder={t(language(), 'placeholder')}
        required
      />
      <span id="question-limits" class="sr-only">
        {QUESTION_MAX_CHARACTERS} / {QUESTION_MAX_BYTES} UTF-8. {t(language(), 'limits')}
      </span>
      <div class="composer-tools">
        <span class="composer-hint" aria-hidden="true">
          {t(language(), 'enterHint')}
        </span>
        <span class="answer-in" aria-hidden="true">
          {t(language(), 'answerIn')}
        </span>
        <Select
          label="Answer language"
          hideLabel
          class="language-select"
          value={language()}
          onChange={(value) => {
            languageChosen = true;
            setLanguage(value as 'en' | 'vi');
          }}
          options={[
            { value: 'en', label: 'English' },
            { value: 'vi', label: 'Tiếng Việt' },
          ]}
        />
        <Show
          when={busy()}
          fallback={
            <button
              class="primary"
              type="submit"
              title="Ask noti.school"
              disabled={accessScope() === 'initial' || answersUnavailable()}
            >
              {t(language(), 'ask')} <ArrowUp size={18} />
            </button>
          }
        >
          <button type="button" onClick={() => cancel()}>
            <X size={18} /> {t(language(), 'stopWaiting')}
          </button>
        </Show>
      </div>
    </form>
  );
  return (
    <div
      class="app-shell"
      data-motion={siteMotion() ? 'on' : 'off'}
      data-scrolled={scrolled() ? 'true' : 'false'}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        const link = event.target instanceof Element ? event.target.closest('a') : null;
        if (link?.getAttribute('href') !== `#${route()}`) return;
        // A same-route hash link emits no route change; still return to the primary task.
        event.preventDefault();
        const target =
          route() === '/'
            ? document.getElementById('question')
            : document.querySelector<HTMLElement>('main h1, main h2');
        target?.focus({ preventScroll: true });
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
      <ScrollFx motion={siteMotion() && !appRoute()} home={route() === '/'} />
      <Show when={style() === 'glass'}>
        {/* Refraction source for the hero composer's backdrop (Chromium only, see style-flag.ts). */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <filter id="glass-refract" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.011 0.019" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      </Show>
      <SiteHeader route={route()} signedIn={!!me()} app={appRoute()} />
      <main id="main" tabIndex={-1}>
        <div class="scroll-sentinel" ref={sentinel} aria-hidden="true" />
        <Show when={route() === '/' || transitioning()}>
          <div class="site-home" data-site-page="home">
            <section
              ref={(node) => heroIntro(node)}
              class="hero"
              classList={{ leaving: route() !== '/' }}
              aria-hidden={route() !== '/'}
              inert={route() !== '/'}
            >
              <Archive paused={paused()} zoom={zoom()} />
              <div class="hero-content">
                <div class="institution">
                  <Show
                    when={!(institutions.error && !institutions.loading)}
                    fallback={
                      <button type="button" class="institution-retry" onClick={() => void reloadInstitutions()}>
                        <School size={17} aria-hidden="true" /> Couldn’t load institutions · Retry
                      </button>
                    }
                  >
                    <Select
                      id="institution"
                      label="Institution"
                      hideLabel
                      icon={<School size={17} aria-hidden="true" />}
                      value={institution()}
                      placeholder={institutions.loading ? 'Loading institutions…' : 'Choose your institution'}
                      onChange={(value) => {
                        cancel(false);
                        setInstitution(value);
                        setAnswer(undefined);
      setTurns([]);
                      }}
                      options={(institutions()?.items ?? []).map((item: Institution) => ({
                        value: item.id,
                        label: item.name + (item.coverage === 'synthetic_demo' ? ' · Demo' : ''),
                      }))}
                    />
                  </Show>
                </div>
                <h1 tabIndex={-1} aria-label="noti.school">
                  <For each={[...'noti.school']}>
                    {(c, i) => (
                      <span class="ch" classList={{ dot: c === '.' }} style={{ '--i': i() }}>
                        {c}
                      </span>
                    )}
                  </For>
                </h1>
                <p class="promise">
                  <Words text="Your university questions," />
                  <br class="mobile-break" /> <Words class="shine" text="answered with sources." />
                </p>
                <Show when={route() === '/'}>{form()}</Show>
                {answerNotice('suggestions')}
                <div class="suggestions" hidden={!!answerState()}>
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
                        <ArrowRight size={15} />
                      </button>
                    )}
                  </For>
                </div>
                <Show when={selected()?.coverage === 'synthetic_demo'}>
                  <p class="coverage">Demo collection</p>
                </Show>
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
                disabled={reduced()}
                aria-describedby={reduced() ? 'system-motion' : undefined}
                onClick={() => setPaused((v) => !v)}
              >
                {paused() ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <Show when={reduced()}>
                <span id="system-motion" class="sr-only">
                  Animation is disabled by your system’s reduced-motion preference.
                </span>
              </Show>
            </section>
            <Show when={route() === '/'}>
              <HomeSections motion={siteMotion()} institution={institution()} />
            </Show>
          </div>
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
        <Show when={isAnswer()}>
          <AnswerView
            institution={institution()}
            institutionName={selected()?.name}
            demo={demo()}
            busy={busy()}
            restoring={restoring()}
            restoreError={restoreError()}
            error={error()}
            authError={authError()}
            pendingLanguage={pendingLanguage()}
            turns={turns()}
            citation={citation()}
            setCitation={chooseCitation}
            feedback={feedback()}
            toggleFeedback={(id) => {
              setFeedbackMessage('');
              setFeedback((current) => (current === id ? '' : id));
            }}
            feedbackMessage={feedbackMessage()}
            setFeedbackMessage={setFeedbackMessage}
            origin={origin()}
            conversationId={conversation()?.institution === institution() ? conversation()?.id : undefined}
            canDelete={!!member()}
            refreshHistory={refreshHistory}
            deleted={(id) => {
              // Fingerprints are one-way, so retained identities cannot be matched to this
              // conversation; drop them all so no later ask replays into deleted history.
              forgetOperations();
              if (conversation()?.id === id) {
                setConversation(undefined);
                saveDraft(draft(), draftOwner);
              }
              setTurns([]);
              setAnswer(undefined);
            }}
            notice={answerNotice()}
            form={form()}
          />
        </Show>
        <Show when={route().startsWith('/sources')}>
          <div class="page">
            <Show when={accessScope()} keyed>
              {(_scope) => (
                <Show
                  when={documentRoute()}
                  keyed
                  fallback={<Sources institution={institution()} source={route().split('/')[2] || ''} />}
                >
                  {(doc) => (
                    <DocumentView institution={institution()} source={doc.source} version={doc.version} query={query()} />
                  )}
                </Show>
              )}
            </Show>
          </div>
        </Show>
        <Show when={route().startsWith('/auth') ? authCallback() : undefined} keyed>
          <div class="page">
            <Show when={accessScope()} keyed>
              {(_scope) => (
                <Auth
                  callback={authCallback()}
                  capabilities={capabilities()}
                  authenticated={!!me()}
                  account={
                    me()
                      ? {
                          userId: me()!.identity.user_id,
                          memberships: me()!.memberships.map((m) => ({
                            institution: institutions()?.items.find((i) => i.id === m.institution_id)?.name ?? 'Unknown institution',
                            role: m.role,
                          })),
                        }
                      : undefined
                  }
                  refresh={() => {
                    void refreshMe();
                    void refreshCapabilities();
                  }}
                  joined={(id) => {
                    void reloadInstitutions();
                    setInstitution(id);
                  }}
                  signedOut={signedOut}
                  deletionSpent={() => {
                    // Mutate in place: replacing the keyed callback would remount and clear the result message.
                    const callback = untrack(authCallback);
                    if (callback) callback.deletion = '';
                  }}
                />
              )}
            </Show>
          </div>
        </Show>
        <Show when={route().startsWith('/admin')}>
          <div class="page">
            <Show when={accessScope()} keyed>
              {(_scope) => (
                <Admin
                  institution={institution()}
                  signedIn={!!me()}
                  allowed={
                    me()?.memberships.some(
                      (m) => m.institution_id === institution() && m.role === 'admin',
                    ) ?? false
                  }
                />
              )}
            </Show>
          </div>
        </Show>
        <Show when={route().startsWith('/history')}>
          <History
            institution={institution()}
            setInstitution={setInstitution}
            historyLoading={history.loading}
            historyError={history.error}
            history={visibleHistory()}
            listCursor={listCursor()}
            setListCursor={setListCursor}
            institutionName={(id) => institutions()?.items.find((i) => i.id === id)?.name}
            opening={() => setOrigin('history')}
          />
        </Show>
        <Show
          when={
            !isSiteRoute(route()) &&
            !/^\/(?:$|answer(?:\/|$)|sources(?:\/|$)|auth(?:\/|$)|admin(?:\/|$)|history(?:\/|$))/.test(
              route(),
            )
          }
        >
          <div class="page not-found">
            <h1 tabIndex={-1}>Page not found</h1>
            <p class="muted">There is nothing at this address. These places exist:</p>
            <nav class="not-found-links" aria-label="Where to go instead">
              <a class="primary" href="#/">Home</a>
              <a href="#/sources">Sources</a>
              <a href="#/history">History</a>
              <Show when={draft().trim()}>
                <a href="#/">Return to your question</a>
              </Show>
            </nav>
          </div>
        </Show>
      </main>
      <SiteFooter
        paused={paused()}
        reduced={reduced()}
        toggle={() => setPaused((v) => !v)}
        slim={appRoute()}
        glass={{ on: style() === 'glass', toggle: () => setStyle(style() === 'glass' ? 'classic' : 'glass') }}
      />
    </div>
  );
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
