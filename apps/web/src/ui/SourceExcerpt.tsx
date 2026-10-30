// intent: one cited source passage block: mono locator line, copy-citation button, and text with <mark> passages.
// status: done
// next: wrap each supporting span in <Passage id> so the active citation highlights it; never mark decorative text.
// confidence: high
import FileText from 'lucide-solid/icons/file-text';
import Link from 'lucide-solid/icons/link';
import { createContext, useContext, type Accessor, type JSX } from 'solid-js';
import { Button } from './Button';
import { copyText } from './lib/clipboard';
import { cx } from './lib/cx';
import { toast } from './Toaster';
import { Tooltip } from './Tooltip';
import styles from './SourceExcerpt.module.scss';

const ActivePassage = createContext<Accessor<string | undefined>>(() => undefined);

export interface SourceExcerptProps {
  /** Document version and page/section, e.g. "Sample Student Handbook, 2025 ed. · p. 31 · sec. 4.2". */
  locator: string;
  /** Text copied by the copy-citation button; defaults to the locator. */
  citation?: string;
  /** Id of the Passage to highlight, usually the pressed CitationChip's id. */
  activePassage?: string | undefined;
  /** Excerpt text containing Passage elements. */
  children: JSX.Element;
  class?: string | undefined;
}

/** Source excerpt with locator, copy-citation (toast on success or failure) and highlighted active passage. */
export function SourceExcerpt(props: SourceExcerptProps) {
  const copy = async () => {
    const copied = await copyText(props.citation ?? props.locator);
    if (copied) toast('Citation copied');
    else toast('Copy failed. Select the citation text instead.', 'error');
  };
  return (
    <ActivePassage.Provider value={() => props.activePassage}>
      <div class={cx(styles.source, props.class)}>
        <div class={styles.meta}>
          <FileText size={14} aria-hidden="true" />
          <span>{props.locator}</span>
          <Tooltip content="Copy citation">
            {trigger => (
              <Button {...trigger} class={styles.copy} variant="ghost" size="sm" iconOnly aria-label="Copy citation" onClick={() => void copy()}>
                <Link aria-hidden="true" />
              </Button>
            )}
          </Tooltip>
        </div>
        <p class={styles.text}>{props.children}</p>
      </div>
    </ActivePassage.Provider>
  );
}

export interface PassageProps {
  /** Matches SourceExcerpt's activePassage when this span supports the selected citation. */
  id: string;
  children: JSX.Element;
}

/** Supporting span inside SourceExcerpt; rendered as <mark> and highlighted while its citation is active. */
export function Passage(props: PassageProps) {
  const active = useContext(ActivePassage);
  return (
    <mark class={styles.mark} data-passage={props.id} data-active={active() === props.id ? '' : undefined}>
      {props.children}
    </mark>
  );
}
