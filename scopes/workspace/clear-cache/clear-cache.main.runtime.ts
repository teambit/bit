import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { clearCache } from '@teambit/legacy/dist/api/consumer';
import { ExternalActions } from '@teambit/legacy/dist/api/scope/lib/action';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';

import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import ClearCacheCmd from './clear-cache-cmd';
import { ClearCacheAspect } from './clear-cache.aspect';
import { ClearCacheAction } from './clear-cache-action';

export class ClearCacheMain {
  constructor(private workspace?: Workspace) {}

  async clearCache(): Promise<string[]> {
    return clearCache();
  }

  async clearRemoteCache(remote: string) {
    const remoteObj = await getRemoteByName(remote, this.workspace?.consumer);
    const result = await remoteObj.action(ClearCacheAction.name, {});
    return result;
  }

  static slots = [];
  static dependencies = [WorkspaceAspect, CLIAspect, ScopeAspect, CommunityAspect];
  static runtime = MainRuntime;
  static async provider([workspace, cli, scope, community]: [Workspace, CLIMain, ScopeMain, CommunityMain]) {
    const clearCacheMain = new ClearCacheMain(workspace);
    cli.register(new ClearCacheCmd(clearCacheMain, community.getDocsDomain()));
    ExternalActions.externalActions.push(new ClearCacheAction(scope));

    return clearCacheMain;
  }
}

ClearCacheAspect.addRuntime(ClearCacheMain);
