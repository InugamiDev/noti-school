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
