export { DiffViewer } from './diff-viewer';
export type { DiffViewerProps, DiffViewMode, DiffFileStatus } from './diff-viewer';
export { computeDiffLines, buildSections, statsFromItems, pairForSplit, intraLineDiff } from './diff-model';
export type { DiffLineItem, DiffLineType, DiffSection, DiffStats, SplitRow } from './diff-model';
export { useHighlightedLines, langFromFileName } from './highlighter';
export type { HlToken, HlLines } from './highlighter';
export { bitShikiTheme, resolveTokenColor, BIT_THEME_NAME } from './shiki-bit-theme';
