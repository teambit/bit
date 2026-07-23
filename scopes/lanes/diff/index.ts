export { LaneDiffCmd } from './lane-diff.cmd';
export { LaneHistoryDiffCmd } from './lane-history-diff.cmd';
export { LaneDiffGenerator, LaneDiffResults } from './lane-diff-generator';
export { getHeadOnMain, importMainHeads } from './resolve-main-head';
export { LaneDiffCache, laneCompositionFingerprint } from './lane-diff-cache';
export type { CacheableComponentStatus, LaneDiffStatusCacheOptions, LaneLike } from './lane-diff-cache';
export { classifyVersionChanges } from './classify-version-changes';
export type { VersionChangeSide } from './classify-version-changes';
