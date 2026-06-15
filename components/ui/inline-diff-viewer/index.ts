export {
  DiffFileRenderer,
  DiffFileHeader,
  HighlightedCode,
  FeedbackBadgeDisplay,
  ChangeBar,
  parseDiffOutput,
  computeDiffFromContent,
  computeNewFileHunks,
  computeDeletedFileHunks,
  buildFileDiffsFromMap,
  DiffLoadingSkeleton,
} from './inline-diff-viewer';
export type {
  DiffFileRendererProps,
  DiffLine,
  DiffHunk,
  LineFeedback,
  DiffDisplayMode,
  FileDiffEntry,
} from './inline-diff-viewer';
