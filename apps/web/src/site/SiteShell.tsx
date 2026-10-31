import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js';
import { ArrowUpRight, ChevronDown, Menu, Pause, Play, Sparkles, X } from 'lucide-solid';

export const sitePages = {
  '/': [
    'Answers with sources',
    'Your university questions, answered with sources. An independent pilot for students and university staff.',
  ],
  '/product': [
    'Product',
    'Follow a question from answer to source passage, document version and feedback.',
  ],
  '/students': [
    'For students',
    'Find university information, check its source and know when to ask for help.',
  ],
  '/universities': [
    'For universities',
    'Explore a considered approach to source approval, document updates and student feedback.',
  ],
  '/pricing': [
    'Pricing and pilot access',
    'Pilot access is limited. Public pricing and paid plans have not been announced.',
  ],
  '/about': [
    'About noti.school',
    'An independent project making university information easier to find and inspect.',
  ],
  '/help': [
    'Help',
    'Practical help with questions, sources, account access and unavailable answers.',
  ],
  '/contact': [
    'Contact',
    'Get in touch about access, your institution’s documents or a problem with an answer.',
  ],
  '/security': [
    'Security',
    'How noti.school controls access to accounts, documents and answers.',
  ],
  '/privacy': [
    'Pilot privacy notice',
    'Read the draft notice on account data, questions, source passages and external processing.',
  ],
  '/terms': [
    'Pilot terms draft',
    'Understand the limits of an independent university information assistant.',
  ],
  '/changelog': [
    'Changelog',
    'What noti.school can do today.',
  ],
} as const;

export type SiteRoute = keyof typeof sitePages;
export function isSiteRoute(route: string): route is SiteRoute {
  return Object.hasOwn(sitePages, route);
}

const productLinks = [
  ['Product', '/product'],
  ['Students', '/students'],
  ['Universities', '/universities'],
  ['Pricing', '/pricing'],
] as const;
const resourceLinks = [
  ['Help', '/help'],
  ['About', '/about'],
  ['Changelog', '/changelog'],
  ['Security', '/security'],
  ['Contact', '/contact'],
] as const;

// intent: preserve direct workspace entry while expanding product navigation; status: implemented.
export function SiteHeader(props: { route: string; signedIn: boolean; app?: boolean }) {
  const [open, setOpen] = createSignal(false);
  const [resources, setResources] = createSignal(false);
  let header!: HTMLElement;
  let toggle!: HTMLButtonElement;
  let resourceToggle!: HTMLButtonElement;
  const close = () => {
    setOpen(false);
    setResources(false);
  };
  createEffect(() => {
    void props.route;
    close();
  });
  const outside = (event: PointerEvent) => {
    if (event.target instanceof Node && !header.contains(event.target)) close();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (open()) {
      close();
      toggle.focus();
    } else if (resources()) {
      close();
      resourceToggle.focus();
    }
  };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  const desktop = matchMedia('(min-width: 1100px)');
  desktop.addEventListener('change', close);
  onCleanup(() => {
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
    desktop.removeEventListener('change', close);
  });
  return (
    <header
      class="site-header"
      classList={{ 'site-header-app': !!props.app }}
      ref={(node) => {
        header = node;
      }}
      onFocusOut={(event) => {
        if (event.relatedTarget instanceof Node && !header.contains(event.relatedTarget)) close();
      }}
    >
      <a class="wordmark" href="#/" aria-label="noti.school home">
        <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" rx="16" />
          <path d="M17 49V21M17 33q0-12 11-12t11 12v16" />
          <circle cx="51" cy="44.5" r="5.5" />
        </svg>
      </a>
      <nav class="site-desktop" aria-label="Product navigation">
        <For each={productLinks}>
          {([label, path]) => (
            <a href={`#${path}`} aria-current={props.route === path ? 'page' : undefined}>
              {label}
            </a>
          )}
        </For>
        <div class="site-resources">
          <button
            ref={(node) => {
              resourceToggle = node;
            }}
            aria-expanded={resources()}
            aria-controls="site-resources"
            onClick={() => setResources((v) => !v)}
          >
            Resources <ChevronDown size={14} />
          </button>
          <Show when={resources()}>
            <div class="site-resource-menu" id="site-resources">
              <For each={resourceLinks}>
                {([label, path]) => (
                  <a href={`#${path}`} onClick={close}>
                    {label}
                  </a>
                )}
              </For>
            </div>
          </Show>
        </div>
      </nav>
      <nav class="site-workspace" aria-label="Main navigation">
        <a href="#/sources" aria-current={props.route.startsWith('/sources') ? 'page' : undefined}>
          Sources
        </a>
        <a href="#/history" aria-current={props.route.startsWith('/history') ? 'page' : undefined}>
          History
        </a>
        <a
          class="site-account"
          href="#/auth"
          aria-current={props.route.startsWith('/auth') ? 'page' : undefined}
        >
          {props.signedIn ? 'Account' : 'Sign in'}
        </a>
        <button
          class="site-menu-toggle"
          ref={(node) => {
            toggle = node;
          }}
          aria-label={open() ? 'Close navigation' : 'Open navigation'}
          aria-expanded={open()}
          aria-controls="site-mobile-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          {open() ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      <Show when={open()}>
        <nav id="site-mobile-navigation" class="site-mobile" aria-label="Site navigation">
          <div>
            <span>Explore</span>
            <For each={productLinks}>
              {([label, path]) => (
                <a
                  href={`#${path}`}
                  onClick={close}
                  aria-current={props.route === path ? 'page' : undefined}
                >
                  {label}
                </a>
              )}
            </For>
          </div>
          <div>
            <span>Resources</span>
            <For each={resourceLinks}>
              {([label, path]) => (
                <a
                  href={`#${path}`}
                  onClick={close}
                  aria-current={props.route === path ? 'page' : undefined}
                >
                  {label}
                </a>
              )}
            </For>
          </div>
        </nav>
      </Show>
    </header>
  );
}

const footerGroups = [
  { title: 'Product', links: productLinks },
  {
    title: 'Resources',
    links: [
      ['Browse sources', '/sources'],
      ['Help', '/help'],
      ['Changelog', '/changelog'],
    ],
  },
  {
    title: 'Project',
    links: [
      ['About', '/about'],
      ['Contact', '/contact'],
      ['GitHub', 'https://github.com/InugamiDev'],
    ],
  },
  {
    title: 'Trust',
    links: [
      ['Security', '/security'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
    ],
  },
] as const;

export function SiteFooter(props: {
  paused: boolean;
  reduced: boolean;
  toggle: () => void;
  slim?: boolean;
  /** Glass is the default style; this switches to classic and back. */
  glass?: { on: boolean; toggle: () => void } | undefined;
}) {
  return (
    <footer class="site-footer" classList={{ 'site-footer-slim': !!props.slim }}>
      <Show when={!props.slim}>
      <div class="site-footer-top">
        <div class="site-footer-intro">
          <a class="site-footer-brand" href="#/">
            noti.school
          </a>
          <p>
            University questions.
            <br />A source you can return to.
          </p>
          <p class="site-fine">
            An independent project.
            <br />
            Not affiliated with any university.
          </p>
        </div>
        <For each={footerGroups}>
          {(group) => (
            <nav aria-label={`${group.title} footer`}>
              <h2>{group.title}</h2>
              <For each={group.links}>
                {([label, path]) => (
                  <a href={path.startsWith('https:') ? path : `#${path}`}>
                    {label}
                    {path.startsWith('https:') && <ArrowUpRight size={14} />}
                  </a>
                )}
              </For>
            </nav>
          )}
        </For>
      </div>
      </Show>
      <div class="site-footer-bottom">
        <Show
          when={!props.slim}
          fallback={
            <>
              <a class="site-footer-mini-brand" href="#/">noti.school</a>
              <a href="#/help">Help</a>
              <a href="#/privacy">Privacy</a>
              <a href="#/terms">Terms</a>
            </>
          }
        >
          <a href="#/admin">For institutions</a>
          <a href="#/contact">Pilot enquiries</a>
        </Show>
        <button disabled={props.reduced} aria-pressed={props.paused} onClick={props.toggle}>
          {props.paused || props.reduced ? <Play size={14} /> : <Pause size={14} />}
          {props.reduced
            ? 'System reduced motion'
            : props.paused
              ? 'Resume site motion'
              : 'Pause site motion'}
        </button>
        <Show when={props.glass}>
          {(glass) => (
            <button class="glass-switch" aria-pressed={glass().on} onClick={glass().toggle} title="Switch between the glass and classic styles">
              <Sparkles size={14} />
              Glass style
            </button>
          )}
        </Show>
      </div>
    </footer>
  );
}
