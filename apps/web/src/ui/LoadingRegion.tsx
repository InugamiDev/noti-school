// intent: one loading contract for every remote region: aria-busy while pending, exactly one polite status text, decorative
//         skeletons that reserve the content's box, delayed so fast responses never flash, and a fade-in on arrival.
// status: done
// next: pass `since` when the region can remount during one wait (keyed on access scope), so the delay is not restarted.
// confidence: high
import { createMemo, Show, type JSX } from 'solid-js';
import { cx } from './lib/cx';
import { createDelayedLoading } from './lib/loading';
import styles from './LoadingRegion.module.scss';

export interface LoadingRegionProps {
  /** True while the data this region depends on is unresolved. Unknown is loading, never "no". */
  loading: boolean;
  /** Status text read politely while loading, sentence case ending in "…", e.g. "Loading sources…". */
  label: string;
  /** Placeholder shapes (Skeleton, SkeletonText, SkeletonRow); always aria-hidden. */
  skeleton: JSX.Element;
  /** Content rendered once loading ends. */
  children?: JSX.Element;
  /** Class of the region element. */
  class?: string | undefined;
  /** Layout class shared by the skeleton and the content wrapper, so both occupy the same box. */
  innerClass?: string | undefined;
  /** Timestamp (Date.now clock) when the wait began, if before this region mounted. */
  since?: number | undefined;
  delay?: number;
  minVisible?: number;
}

/** Busy region: delayed skeleton, single live status and a reveal fade when the content arrives. */
export function LoadingRegion(props: LoadingRegionProps) {
  const shown = createDelayedLoading(() => props.loading, {
    ...(props.delay === undefined ? {} : { delay: props.delay }),
    ...(props.minVisible === undefined ? {} : { minVisible: props.minVisible }),
    ...(props.since === undefined ? {} : { since: props.since }),
  });
  // A shown skeleton holds until its minimum time passes, so the region stays busy for that long too.
  const busy = () => props.loading || shown();
  // Content that was never waited for appears without a fade.
  const waited = createMemo((previous: boolean) => previous || busy(), false);
  return (
    <div class={props.class} aria-busy={busy() ? 'true' : undefined} data-loading-region>
      <p class={styles.status} role="status">
        {busy() ? props.label : ''}
      </p>
      <Show
        when={busy()}
        fallback={<div class={cx(waited() && 'reveal', props.innerClass)}>{props.children}</div>}
      >
        <div class={cx(!shown() && styles.waiting, props.innerClass)} aria-hidden="true" data-skeleton>
          {props.skeleton}
        </div>
      </Show>
    </div>
  );
}
