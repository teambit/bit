import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { clearCache, CacheClearResult } from '@teambit/legacy/dist/api/consumer/lib/clear-cache';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { loadConsumerIfExist, Consumer } from '@teambit/legacy/dist/consumer';
import ClearCacheCmd from './clear-cache-cmd';
import { ClearCacheAspect } from './clear-cache.aspect';

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
    } catch (err: any) {
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
