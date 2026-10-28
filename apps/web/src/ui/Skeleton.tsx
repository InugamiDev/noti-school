// intent: decorative loading placeholders. Skeleton is one bar; SkeletonText and SkeletonRow compose it into shapes that
//         reserve the same box as the content that replaces them (text line boxes, list rows), so arrival does not reflow.
// status: done
// next: wrap skeletons in LoadingRegion, which owns aria-busy and the single status text.
// confidence: high
import { For, Show } from 'solid-js';
import { cx } from './lib/cx';
import styles from './Skeleton.module.scss';

export interface SkeletonProps {
  /** CSS width, e.g. "92%" or "120px"; defaults to 100%. */
  width?: string;
  /** CSS height; defaults to 14px (one text line). */
  height?: string;
  /** line (6px) for text, sm (10px) for blocks. */
  radius?: 'line' | 'sm';
  class?: string | undefined;
}

/** Decorative loading placeholder; the surrounding region should carry aria-busy and visible progress text. */
export function Skeleton(props: SkeletonProps) {
  return (
    <div
      class={cx(styles.skeleton, props.radius === 'sm' && styles.block, props.class)}
      style={{ width: props.width ?? '100%', height: props.height ?? '14px' }}
      aria-hidden="true"
    />
  );
}

export interface SkeletonTextProps {
  /** Number of lines; defaults to 1. */
  lines?: number;
  /** Width of every line but the last; defaults to 100%. */
  width?: string;
  /** Width of the last line when there is more than one; defaults to 60%. */
  lastWidth?: string;
  /** Sets font and line-height, so each line box matches the text it stands in for. */
  class?: string | undefined;
}

/** Text placeholder: each line is one line box of the inherited font, so its height equals real text of that style. */
export function SkeletonText(props: SkeletonTextProps) {
  const count = () => Math.max(1, props.lines ?? 1);
  const width = (index: number) =>
    count() > 1 && index === count() - 1 ? (props.lastWidth ?? '60%') : (props.width ?? '100%');
  return (
    <div class={cx(styles.text, props.class)} aria-hidden="true">
      <For each={Array.from({ length: count() }, (_, index) => index)}>
        {(index) => (
          <div class={styles.line}>
            <Skeleton class={styles.bar} width={width(index)} height="0.7em" />
          </div>
        )}
      </For>
    </div>
  );
}

export interface SkeletonRowProps {
  /** Leading icon tile; defaults to true. */
  icon?: boolean;
  /** Small mono line under the title; defaults to true. */
  meta?: boolean;
  /** Adds a status badge placeholder on the right. */
  pill?: boolean;
  /** Width of the title line; defaults to 55%. */
  titleWidth?: string;
  class?: string | undefined;
}

/** List row placeholder: icon tile, title line and small mono meta line, optional trailing badge pill. */
export function SkeletonRow(props: SkeletonRowProps) {
  return (
    <div class={cx(styles.row, props.class)} aria-hidden="true">
      <Show when={props.icon !== false}>
        <Skeleton class={styles.tile} width="var(--tile)" height="var(--tile)" radius="sm" />
      </Show>
      <div class={styles.rowText}>
        <SkeletonText width={props.titleWidth ?? '55%'} />
        <Show when={props.meta !== false}>
          <SkeletonText class={styles.meta} width="28%" />
        </Show>
      </div>
      <Show when={props.pill}>
        <div class={styles.rowEnd}>
          <Skeleton class={styles.pill} width="104px" height="26px" />
        </div>
      </Show>
    </div>
  );
}
