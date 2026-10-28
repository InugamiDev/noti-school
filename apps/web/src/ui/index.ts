// intent: the only public surface of the Clay component library; later work imports from 'src/ui', never from component files.
// status: done
// next: add new components here with their prop types; keep pure helpers in lib/ so they stay unit-testable.
// confidence: high

export { Accordion, type AccordionItem, type AccordionProps } from './Accordion';
export {
  AnswerCard,
  type AnswerCardProps,
  type AnswerStateProps,
  type LoadingStateProps,
  type NoAnswerStateProps,
  type UnavailableStateProps,
} from './AnswerCard';
export { Badge, type BadgeProps, type BadgeTone } from './Badge';
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { Chip, type ChipProps } from './Chip';
export { CitationChip, type CitationChipProps } from './CitationChip';
export { CommandMenu, useCommandMenu, type CommandMenuProps, type CommandMenuState } from './CommandMenu';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Kbd, type KbdProps } from './Kbd';
export { PromptInput, type PromptInputProps } from './PromptInput';
export { SchoolPicker, type SchoolPickerProps } from './SchoolPicker';
export { SearchInput, type SearchInputProps } from './SearchInput';
export { SegmentedToggle, type SegmentedOption, type SegmentedToggleProps } from './SegmentedToggle';
export { Select, type SelectOption, type SelectProps } from './Select';
export { Sheet, type SheetProps } from './Sheet';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { Passage, SourceExcerpt, type PassageProps, type SourceExcerptProps } from './SourceExcerpt';
export { Spinner, type SpinnerProps } from './Spinner';
export { Tabs, type TabItem, type TabsProps } from './Tabs';
export { TextField, type TextFieldProps } from './TextField';
export { Toaster, toast, type ToastTone } from './Toaster';
export { Tooltip, type TooltipProps, type TooltipTriggerProps } from './Tooltip';

export { copyText } from './lib/clipboard';
export {
  filterCommands,
  groupCommands,
  moveActive,
  resolveCommandEnter,
  type CommandEnter,
  type CommandGroup,
  type CommandItem,
} from './lib/command';
export { cx } from './lib/cx';
export { currentPlatform, isCommandShortcut, isMacPlatform, modifierLabel } from './lib/platform';
export {
  canSubmitPrompt,
  isPlainEnter,
  looksVietnamese,
  promptKeyAction,
  type AnswerLanguage,
  type PromptKeyAction,
  type PromptKeyInput,
} from './lib/prompt';
export { filterSchools, REQUEST_SCHOOL_ID, schoolOptionIds, type School, type SchoolStatus } from './lib/school';
export { createSafeStorage, localStore, sessionStore, type SafeStorage } from './lib/storage';
export { matchesQuery, normalizeVi } from './lib/text';
