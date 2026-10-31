import { For, type JSX } from 'solid-js';

const tile = 'M16 0H48C56.8 0 64 7.2 64 16V48C64 56.8 56.8 64 48 64H16C7.2 64 0 56.8 0 48V16C0 7.2 7.2 0 16 0Z';

/** The "n." mark as a loader: a drop settles into the tile, the n draws, the dot pops, and it
 *  lifts off to repeat. Still under reduced motion or the pause control (a plain tile). */
export function Loader(props: { size?: 'sm' | 'md'; class?: string }) {
  return (
    <span class={`loader loader-${props.size ?? 'md'} ${props.class ?? ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64">
        <path class="loader-shape" d={tile} />
        <path class="loader-n" d="M17 49V21M17 33q0-12 11-12t11 12v16" />
        <circle class="loader-dot" cx="51" cy="44.5" r="5.5" />
      </svg>
    </span>
  );
}

/** Visible, announced progress text with the loader. */
export function LoadingStatus(props: { children: JSX.Element; class?: string }) {
  return (
    <p role="status" class={`loading-status ${props.class ?? ''}`}>
      <Loader size="sm" />
      <span>{props.children}</span>
    </p>
  );
}

/** Placeholder lines shaped like the content that will replace them. */
export function SkeletonLines(props: { lines?: number; class?: string }) {
  const widths = ['96%', '88%', '72%', '91%', '64%'];
  return (
    <div class={`skeleton-lines ${props.class ?? ''}`} aria-hidden="true">
      <For each={Array.from({ length: props.lines ?? 3 }, (_, i) => widths[i % widths.length])}>
        {(width) => <span class="skeleton-line" style={{ width }} />}
      </For>
    </div>
  );
}

/** Card-shaped placeholders for list rows. With a label the group is announced; without, it is decorative. */
export function SkeletonList(props: { rows?: number; label?: string; class?: string }) {
  return (
    <div
      class={`skeleton-list ${props.class ?? ''}`}
      role={props.label ? 'status' : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : 'true'}
    >
      <For each={Array.from({ length: props.rows ?? 3 })}>
        {(_, i) => (
          <div class="skeleton-card" aria-hidden="true">
            <span class="skeleton-dot" />
            <div>
              <span class="skeleton-line" style={{ width: i() % 2 ? '58%' : '74%' }} />
              <span class="skeleton-line short" style={{ width: i() % 2 ? '36%' : '44%' }} />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
