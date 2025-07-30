import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { getRemoteByName } from '@teambit/scope.remotes';
import type { Consumer } from '@teambit/legacy.consumer';
import { loadConsumerIfExist } from '@teambit/legacy.consumer';
import ClearCacheCmd from './clear-cache-cmd';
import { ClearCacheAspect } from './clear-cache.aspect';
import type { CacheClearResult } from './clear-cache';
import { clearCache } from './clear-cache';

/**
 * avoid adding `workspace` / `scope` aspects as dependencies to this aspect.
 * the clear-cache command is often being used when the workspace/scope is not working properly.
 */
export class ClearCacheMain {
  async clearCache(): Promise<CacheClearResult> {
    return clearCache();
  }

  async clearRemoteCache(remote: string) {
    const maybeConsumer = await this.getConsumerGracefully();
    const remoteObj = await getRemoteByName(remote, maybeConsumer);
    const result = await remoteObj.action('ClearCacheAction', {});
    return result;
  }

  private async getConsumerGracefully(): Promise<Consumer | undefined> {
    try {
      return await loadConsumerIfExist();
    } catch {
      return undefined;
    }
  }

  static slots = [];
  static dependencies = [CLIAspect];
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain]) {
    const clearCacheMain = new ClearCacheMain();
    cli.register(new ClearCacheCmd(clearCacheMain));
    return clearCacheMain;
  }
}

ClearCacheAspect.addRuntime(ClearCacheMain);
