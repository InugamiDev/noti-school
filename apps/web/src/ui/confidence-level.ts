import type { z } from 'zod';
import type { Schemas } from '@noti/contracts';
import type { StringKey } from './i18n';

// intent: one place for how a calibrated score becomes words, so every surface labels it the same way.
// status: done | next: revisit thresholds only with the owner | confidence: high
export type ConfidenceParts = z.infer<typeof Schemas.Confidence>;
export type Level = 'high' | 'medium' | 'low';

/** High from 0.8, Medium from 0.6, Low below (owner decision, 18 Nov 2026). */
export const confidenceLevel = (value: number): Level =>
  value >= 0.8 ? 'high' : value >= 0.6 ? 'medium' : 'low';

/** Whole percent, rounded down so the number never contradicts its label (0.799 reads 79%, Medium). */
export const percent = (value: number) => `${Math.floor(value * 100 + 1e-9)}%`;

export const levelKey: Record<Level, StringKey> = {
  high: 'confidenceHigh',
  medium: 'confidenceMedium',
  low: 'confidenceLow',
};
export const sentenceKey: Record<Level, StringKey> = {
  high: 'answerConfidenceHigh',
  medium: 'answerConfidenceMedium',
  low: 'answerConfidenceLow',
};
/** The four checks behind a score, in the order they are explained to readers. */
export const parts: readonly { field: 'school' | 'source' | 'relevance' | 'answers'; key: StringKey }[] = [
  { field: 'school', key: 'partSchool' },
  { field: 'source', key: 'partSource' },
  { field: 'relevance', key: 'partRelevance' },
  { field: 'answers', key: 'partAnswers' },
];
