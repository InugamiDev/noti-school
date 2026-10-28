// intent: Clay site shell: dismissible pilot notice, sticky nav with search and account entry, mobile sheet, footer.
// status: done
// next: workspace pages (sources, history, admin, auth) are linked from the footer and the command menu, not the top nav.
//       While identity is unknown the account control is a placeholder of the same box, so nothing flips or reflows.
// confidence: high
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { Menu, Pause, Play, Search, X } from 'lucide-solid';
import type { SessionState } from '../app/session';
import { Button, createDelayedLoading, Kbd, localStore, Sheet } from '../ui';

export { isSiteRoute, sitePages, type SiteRoute } from './routes';

const PILOT_DISMISSED = 'pilot-dismissed';

const navLinks = [
  ['How it works', '#how'],
  ['Who it’s for', '#roles'],
  ['For universities', '#/universities'],
  ['Help', '#/help'],
] as const;

const current = (route: string, href: string) => (href === `#${route}` ? 'page' : undefined);

export function PilotNotice() {
  const [hidden, setHidden] = createSignal(localStore.get(PILOT_DISMISSED) === '1');
  return (
    <Show when={!hidden()}>
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
              setHidden(true);
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

export function SiteHeader(props: { route: string; session: SessionState; onSearch: () => void }) {
  const signedIn = () => props.session === 'signed-in';
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
          <For each={navLinks}>
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
          size="sm"
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
            variant={signedIn() ? 'secondary' : 'primary'}
            size="sm"
            href="#/auth"
            aria-current={props.route.startsWith('/auth') ? 'page' : undefined}
          >
            {signedIn() ? 'Account' : 'Sign in'}
          </Button>
        </Show>
        <Button
          class="site-nav-menu"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Open menu"
          aria-expanded={open()}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
        >
          <Menu aria-hidden="true" />
        </Button>
      </div>
      <Sheet open={open()} onOpenChange={setOpen} title="Menu">
        <nav class="site-sheet-links" aria-label="Menu">
          <For each={navLinks}>
            {([label, href]) => (
              <a href={href} aria-current={current(props.route, href)} onClick={() => setOpen(false)}>
                {label}
              </a>
            )}
          </For>
          <a href="#join" onClick={() => setOpen(false)}>
            Request your university
          </a>
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

export function SiteFooter(props: { paused: boolean; reduced: boolean; toggle: () => void }) {
  return (
    <footer class="site-footer">
      <div class="site-wrap">
        <div class="site-footer-top">
          <Logo />
          <p>Independent project. Not affiliated with any university.</p>
        </div>
        <div class="site-footer-groups">
          <For each={footerGroups}>
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
