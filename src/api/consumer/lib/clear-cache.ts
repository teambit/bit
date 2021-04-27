import fs from 'fs-extra';
// it's a hack, but I didn't find a better way to access the getCacheDir() function
import { __TEST__ as v8CompileCache } from 'v8-compile-cache';
import { Consumer, getConsumerInfo, loadConsumerIfExist } from '../../../consumer';
import { ComponentFsCache } from '../../../consumer/component/component-fs-cache';
import { Scope } from '../../../scope';
import { loadScopeIfExist } from '../../../scope/scope-loader';

class CacheClearer {
  private cacheCleared: string[] = [];
  async clear() {
    this.clearV8CompiledCode();
    await this.clearFSCache();
    await this.clearScopeIndex();

    return this.cacheCleared;
  }

  private clearV8CompiledCode() {
    const cacheDir = v8CompileCache.getCacheDir();
    fs.removeSync(cacheDir);
    this.cacheCleared.push('v8-compile-cache code');
  }

  private async clearFSCache() {
    const fsCachePath = await this.getFSCachePath();
    if (fsCachePath) {
      fs.removeSync(fsCachePath);
      this.cacheCleared.push('components cache on the filesystem');
    }
  }

  private async getConsumerGracefully(): Promise<Consumer | undefined> {
    try {
      return await loadConsumerIfExist();
    } catch (err) {
      return undefined;
    }
  }

  private async getScopeGracefully(): Promise<Scope | undefined> {
    try {
      return await loadScopeIfExist();
    } catch (err) {
      return undefined;
    }
  }

  private async getFSCachePath(): Promise<string | null> {
    const consumer = await this.getConsumerGracefully();
    if (consumer) {
      return consumer.componentFsCache.basePath;
    }
    const consumerInfo = await getConsumerInfo(process.cwd());
    if (!consumerInfo) {
      return null; // no workspace around, nothing to do.
    }
    const scope = await this.getScopeGracefully();
    if (!scope) return null;
    const componentFsCache = new ComponentFsCache(scope.path);
    return componentFsCache.basePath;
  }

  private async clearScopeIndex() {
    const scope = await loadScopeIfExist();
    if (scope) {
      await scope.objects.scopeIndex.deleteFile();
      this.cacheCleared.push('scope-index file');
    }
  }
}

export async function clearCache(): Promise<string[]> {
  return new CacheClearer().clear();
}
