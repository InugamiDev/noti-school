import { cx } from './lib/cx';
import styles from './CitationChip.module.scss';

export interface CitationChipProps {
  /** 1-based citation number shown in the chip. */
  index: number;
  /** True when this citation's passage is the highlighted one. */
  pressed: boolean;
  /** Called when the chip is activated. */
  onSelect: () => void;
  /** Accessible name; defaults to "Citation {index}". */
  label?: string;
  class?: string | undefined;
}

/** Numbered inline citation toggle (aria-pressed) that selects its source passage. */
export function CitationChip(props: CitationChipProps) {
  return (
    <button
      type="button"
      class={cx(styles.cite, props.class)}
      aria-pressed={props.pressed}
      aria-label={props.label ?? `Citation ${props.index}`}
      onClick={() => props.onSelect()}
    >
      {props.index}
    </button>
  );
}
