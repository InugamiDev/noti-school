import { createSignal, createUniqueId, For, Show } from 'solid-js';
import { ChevronDown } from 'lucide-solid';
import { t } from './i18n';
import type { Lang } from './format';
import { confidenceLevel, levelKey, parts, percent, type ConfidenceParts, type Level } from './confidence-level';
import './confidence.css';

// intent: show a calibrated score as a word first (High, Medium, Low), then the number, then a small
// bar glyph. Colour only reinforces the word, and the accessible name always carries the label.
// status: done | next: none | confidence: high
const filled: Record<Level, number> = { low: 1, medium: 2, high: 3 };

/** Three rising bars; one, two or three are filled. Decorative: the word beside it says the same. */
function Bars(props: { level: Level }) {
  return (
    <svg class="confidence-bars" viewBox="0 0 14 12" width="14" height="12" aria-hidden="true">
      <For each={[0, 1, 2]}>
        {(i) => (
          <rect
            x={i * 5}
            y={8 - i * 4}
            width="4"
            height={4 + i * 4}
            rx="1"
            class={i < filled[props.level] ? 'on' : 'off'}
          />
        )}
      </For>
    </svg>
  );
}

/** "High 86%" with a spoken "Confidence:" prefix. A missing score says so instead of guessing. */
export function ConfidenceTag(props: { value: number | null; lang?: Lang | undefined; class?: string | undefined }) {
  return (
    <Show
      when={props.value !== null ? { level: confidenceLevel(props.value), value: props.value } : undefined}
      keyed
      fallback={
        <span class={`confidence-tag ${props.class ?? ''}`} data-level="none">
          <span class="sr-only">{t(props.lang, 'confidence')}: </span>
          {t(props.lang, 'confidenceNotScored')}
        </span>
      }
    >
      {(score) => (
        <span class={`confidence-tag ${props.class ?? ''}`} data-level={score.level}>
          <span class="sr-only">{t(props.lang, 'confidence')}: </span>
          <Bars level={score.level} />
          <span class="confidence-word">{t(props.lang, levelKey[score.level])}</span>{' '}
          <span class="confidence-number">{percent(score.value)}</span>
        </span>
      )}
    </Show>
  );
}

/** The tag as a disclosure: expanding it explains the four checks in plain words. */
export function ConfidenceDetails(props: { confidence: ConfidenceParts | null; lang?: Lang | undefined }) {
  const id = `confidence-${createUniqueId()}`;
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={props.confidence} fallback={<ConfidenceTag value={null} lang={props.lang} />}>
      {(c) => (
        <div class="confidence">
          <button
            type="button"
            class="confidence-toggle"
            aria-expanded={open()}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
          >
            <ConfidenceTag value={c().overall} lang={props.lang} />
            <ChevronDown class="confidence-chevron" size={14} aria-hidden="true" />
          </button>
          <div id={id} class="confidence-parts" role="group" aria-label={t(props.lang, 'confidenceParts')} hidden={!open()}>
            <ul>
              <For each={parts}>
                {(part) => (
                  <li>
                    <span class="confidence-part-name">{t(props.lang, part.key)}</span>
                    <span class="confidence-meter" data-level={confidenceLevel(c()[part.field])} aria-hidden="true">
                      <span style={{ width: percent(c()[part.field]) }} />
                    </span>
                    <span class="confidence-part-value">{percent(c()[part.field])}</span>
                  </li>
                )}
              </For>
            </ul>
            <p class="confidence-model">
              {t(props.lang, 'scoredBy')} {c().model}
            </p>
          </div>
        </div>
      )}
    </Show>
  );
}
