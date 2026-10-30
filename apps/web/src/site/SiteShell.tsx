// intent: Clay site shell: dismissible pilot notice, sticky nav with search and account entry, mobile sheet, footer.
//         Marketing routes show the marketing links; workspace routes (answer, sources, history, admin, account) show
//         the workspace links instead, so Ask, Sources and History are one click apart. Admin appears for admins only.
// status: done
// next: while identity is unknown the account control is a placeholder of the same box, so nothing flips or reflows.
//       An identity outage shows a neutral "Account" control, never a "Sign in" call to action.
// confidence: high
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import Menu from 'lucide-solid/icons/menu';
import Pause from 'lucide-solid/icons/pause';
import Play from 'lucide-solid/icons/play';
import Search from 'lucide-solid/icons/search';
import X from 'lucide-solid/icons/x';
import type { SessionState } from '../app/session';
import { Button, createDelayedLoading, Kbd, localStore, Sheet } from '../ui';

export { isSiteRoute, sitePages, type SiteRoute } from './routes';

const PILOT_DISMISSED = 'pilot-dismissed';

type NavLink = readonly [label: string, href: string];

const siteLinks: readonly NavLink[] = [
  ['How it works', '#how'],
  ['Who it’s for', '#roles'],
  ['For universities', '#/universities'],
  ['Help', '#/help'],
];

// "Ask" is the workspace answer page (composer first when nothing is asked), not the marketing landing.
const workspaceLinks: readonly NavLink[] = [
  ['Ask', '#/answer'],
  ['Sources', '#/sources'],
  ['History', '#/history'],
];

/** Routes that belong to the signed-in workspace rather than the public site. */
export const isWorkspaceRoute = (route: string) => /^\/(?:answer|sources|history|admin|auth)(?:\/|$|\?)/.test(route);

// Sub-pages (a source, a conversation) keep their section highlighted.
const current = (route: string, href: string) =>
  href === `#${route}` || (href.length > 2 && route.startsWith(`${href.slice(1)}/`)) ? 'page' : undefined;

export function PilotNotice(props: { hidden?: boolean }) {
  const [dismissed, setDismissed] = createSignal(localStore.get(PILOT_DISMISSED) === '1');
  return (
    <Show when={!dismissed() && !props.hidden}>
      <aside class="site-pilot" aria-label="Pilot notice">
        <div class="site-wrap site-pilot-row">
          <p>
            Now piloting at HCMIU. Other universities can request access.{' '}
            <a href="#join">Request your university</a>
          </p>
          <button
            class="site-pilot-close"
            type="button"
            aria-label="Dismiss notice"
            onClick={() => {
              setDismissed(true);
              localStore.set(PILOT_DISMISSED, '1');
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </aside>
    </Show>
  );
}

function Logo(props: { label?: string }) {
  return (
    <a class="site-logo" href="#/" aria-label={props.label}>
      <span class="site-logo-mark" aria-hidden="true" />
      noti.school
    </a>
  );
}

export function SiteHeader(props: { route: string; session: SessionState; admin: boolean; onSearch: () => void }) {
  const signedIn = () => props.session === 'signed-in';
  // Not knowing who you are is not the same as being signed out.
  const known = () => props.session === 'signed-in' || props.session === 'unavailable';
  const navLinks = (): readonly NavLink[] =>
    isWorkspaceRoute(props.route)
      ? [...workspaceLinks, ...(props.admin ? ([['Admin', '#/admin']] as const) : [])]
      : siteLinks;
  const placeholder = createDelayedLoading(() => props.session === 'loading');
  const [open, setOpen] = createSignal(false);
  const [stuck, setStuck] = createSignal(false);
  onMount(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    onCleanup(() => window.removeEventListener('scroll', onScroll));
  });
  return (
    <header class="site-nav" classList={{ 'site-nav-stuck': stuck() }}>
      <div class="site-wrap site-nav-row">
        <Logo label="noti.school home" />
        <nav class="site-nav-links" aria-label="Main">
          <For each={navLinks()}>
            {([label, href]) => (
              <a href={href} aria-current={current(props.route, href)}>
                {label}
              </a>
            )}
          </For>
        </nav>
        <Button
          class="site-nav-search"
          variant="secondary"
          aria-keyshortcuts="Control+K Meta+K"
          onClick={() => props.onSearch()}
        >
          <Search aria-hidden="true" />
          Search
          <Kbd mod>K</Kbd>
        </Button>
        {/* A shown placeholder is held for its minimum time even if identity resolves sooner (no 10 ms flicker). */}
        <Show
          when={props.session !== 'loading' && !placeholder()}
          fallback={
            <span
              class="site-nav-account site-nav-account-pending"
              classList={{ 'site-nav-account-waiting': !placeholder() }}
              aria-hidden="true"
              data-skeleton
            />
          }
        >
          <Button
            class="site-nav-account reveal"
            variant={known() ? 'secondary' : 'primary'}
            href="#/auth"
            aria-current={props.route.startsWith('/auth') ? 'page' : undefined}
          >
            {known() ? 'Account' : 'Sign in'}
          </Button>
        </Show>
        <Button
          class="site-nav-menu"
          variant="ghost"
          iconOnly
          aria-label="Open menu"
          aria-expanded={open()}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Menu aria-hidden="true" />
        </Button>
      </div>
      <Show when={isWorkspaceRoute(props.route)}>
        <nav class="site-wrap site-subnav" aria-label="Workspace">
          <For each={navLinks()}>
            {([label, href]) => (
              <a href={href} aria-current={current(props.route, href)}>
                {label}
              </a>
            )}
          </For>
        </nav>
      </Show>
      <Sheet open={open()} onOpenChange={setOpen} title="Menu">
        <nav class="site-sheet-links" aria-label="Menu">
          <For each={navLinks()}>
            {([label, href]) => (
              <a href={href} aria-current={current(props.route, href)} onClick={() => setOpen(false)}>
                {label}
              </a>
            )}
          </For>
          <Show when={!isWorkspaceRoute(props.route)}>
            <a href="#join" onClick={() => setOpen(false)}>
              Request your university
            </a>
          </Show>
        </nav>
        <Button
          class="site-sheet-search"
          variant="secondary"
          onClick={() => {
            setOpen(false);
            props.onSearch();
          }}
        >
          <Search aria-hidden="true" />
          Search
        </Button>
      </Sheet>
    </header>
  );
}

const footerGroups = [
  {
    title: 'Product',
    links: [
      ['Product', '#/product'],
      ['Students', '#/students'],
      ['Universities', '#/universities'],
      ['Pricing', '#/pricing'],
    ],
  },
  {
    title: 'Workspace',
    links: [
      ['Ask a question', '#/'],
      ['Sources', '#/sources'],
      ['History', '#/history'],
      ['Source administration', '#/admin'],
    ],
  },
  {
    title: 'Project',
    links: [
      ['About', '#/about'],
      ['Help', '#/help'],
      ['Changelog', '#/changelog'],
      ['Contact', '#/contact'],
    ],
  },
  {
    title: 'Trust',
    links: [
      ['Security', '#/security'],
      ['Privacy', '#/privacy'],
      ['Terms', '#/terms'],
    ],
  },
] as const;

export function SiteFooter(props: { route: string; paused: boolean; reduced: boolean; toggle: () => void }) {
  // On workspace routes the header already carries the workspace links.
  const groups = () => footerGroups.filter(group => group.title !== 'Workspace' || !isWorkspaceRoute(props.route));
  return (
    <footer class="site-footer">
      <div class="site-wrap">
        <div class="site-footer-top">
          <Logo />
          <p>Independent project. Not an official service of any university.</p>
        </div>
        <div class="site-footer-groups">
          <For each={groups()}>
            {group => (
              <nav aria-label={`${group.title} links`}>
                <h2>{group.title}</h2>
                <For each={group.links}>{([label, href]) => <a href={href}>{label}</a>}</For>
              </nav>
            )}
          </For>
        </div>
        <div class="site-footer-bottom">
          <p>Confirm important decisions with the original document and your university office.</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={props.reduced}
            aria-pressed={props.paused}
            onClick={() => props.toggle()}
          >
            {props.paused || props.reduced ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {props.reduced ? 'System reduced motion' : props.paused ? 'Resume site motion' : 'Pause site motion'}
          </Button>
        </div>
      </div>
    </footer>
  );
}
