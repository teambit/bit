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
