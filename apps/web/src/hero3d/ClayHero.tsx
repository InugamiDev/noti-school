// intent: Clay hero stage island. Paints the container, caption and static fallback immediately, then loads
//         the three.js scene only once the stage is on screen and the browser is idle.
// status: done
// next: the landing page passes citation/scope from the answer card and school picker; scene.ts and Archive.tsx retire later.
// confidence: high
import { MousePointer2 } from 'lucide-solid';
import { createEffect, createSignal, on, onCleanup, onMount, type JSX } from 'solid-js';
import type { Citation, HeroScope } from './layout';
import type { SceneHandle } from './scene';
import styles from './ClayHero.module.scss';

export type ClayHeroProps = {
  activeCitation: Citation;
  scope: HeroScope;
  schoolLabel: string;
  class?: string;
  /** Optional caption badge content; defaults to the interaction hint. */
  children?: JSX.Element;
};

const DESCRIPTION =
  'Clay illustration: one bookstack per university on a shared base. Your school is in colour with an open page and a citation pin; another school is locked; an empty slot waits for the next university.';
const IDLE_TIMEOUT_MS = 1200;
const IDLE_FALLBACK_MS = 200;

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(id);
}

export function ClayHero(props: ClayHeroProps) {
  let stage!: HTMLDivElement;
  const [ready, setReady] = createSignal(false);
  let handle: SceneHandle | undefined;
  let cancelIdle: (() => void) | undefined;
  let alive = true;

  const load = async () => {
    const mod = await import('./scene');
    await mod.canvasFontsReady();
    if (!alive) return;
    try {
      handle = mod.mountScene(stage, {
        activeCitation: props.activeCitation,
        scope: props.scope,
        schoolLabel: props.schoolLabel,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        onReady: () => setReady(true),
        onLost: () => setReady(false),
      });
    } catch (error) {
      // WebGL unavailable: the static fallback stays visible.
      console.warn('Clay hero: WebGL unavailable, keeping the static illustration', error);
    }
  };

  onMount(() => {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      cancelIdle = whenIdle(() => {
        load().catch((error: unknown) => console.error('Clay hero: scene failed to load', error));
      });
    });
    observer.observe(stage);
    onCleanup(() => observer.disconnect());
  });

  createEffect(on(() => props.activeCitation, citation => handle?.setCitation(citation), { defer: true }));
  createEffect(on(() => props.scope, scope => handle?.setScope(scope), { defer: true }));
  createEffect(on(() => props.schoolLabel, label => handle?.setLabel(label), { defer: true }));

  onCleanup(() => {
    alive = false;
    cancelIdle?.();
    handle?.dispose();
    handle = undefined;
  });

  return (
    <div
      ref={stage}
      class={[styles.stage, ready() && styles.ready, props.class].filter(Boolean).join(' ')}
      role="img"
      aria-label={DESCRIPTION}
    >
      <div class={styles.caption}>
        {props.children ?? (
          <span class={styles.badge}>
            <MousePointer2 size={14} aria-hidden="true" />
            Click a citation or change school
          </span>
        )}
      </div>
      <div class={styles.fallback}>Handbook illustration</div>
    </div>
  );
}
