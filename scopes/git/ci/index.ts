import { CiAspect } from './ci.aspect';

export default CiAspect;
export { CiAspect };
export type { CiSyncConfig } from './sync/sync-config';
// The git-host contract `bit ci sync` runs on. A provider aspect (gitlab, bitbucket, …) depends on
// CiAspect, implements `GitHostProvider`, and registers it from its own `provider()`:
//   import type { CiMain, GitHostProvider } from '@teambit/ci';
//   ci.registerGitHostProvider(new GitLabHostProvider());
export type { GitHostProvider, PrInfo } from './sync/git-host-provider';
export type { CiMain, GitHostProviderSlot } from './ci.main.runtime';
// The marker `bit ci sync` stamps on its own commits, and the predicate for it. Exported so a trigger —
// a git hook, a webhook router, another aspect deciding whether a push was machine-generated — can share
// the one definition instead of re-spelling the literal and drifting from it.
export { SYNC_COMMIT_MARKER, hasSyncMarker } from './sync/sync-state';
