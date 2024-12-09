import fs from 'fs-extra';
// it's a hack, but I didn't find a better way to access the getCacheDir() function
import { __TEST__ as v8CompileCache } from 'v8-compile-cache';
import { Consumer, loadConsumerIfExist } from '@teambit/legacy.consumer';
import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { FsCache } from '@teambit/workspace.modules.fs-cache';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import { ScopeIndex } from '@teambit/scope.objects';

export type CacheClearResult = { succeed: string[]; failed: string[] };

class CacheClearer {
  private cacheCleared: string[] = [];
  private cacheClearedFailures: string[] = [];
  async clear(): Promise<CacheClearResult> {
    this.clearV8CompiledCode();
    await this.clearFSCache();
    await this.clearScopeIndex();

    return { succeed: this.cacheCleared, failed: this.cacheClearedFailures };
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
    } catch (err: any) {
      return undefined;
    }
  }

  private async getFSCachePath(): Promise<string | null> {
    const consumer = await this.getConsumerGracefully();
    if (consumer) {
      return consumer.componentFsCache.basePath;
    }
    const consumerInfo = await getWorkspaceInfo(process.cwd());
    if (!consumerInfo) {
      return null; // no workspace around, nothing to do.
    }
    const scopePath = findScopePath(consumerInfo.path);
    if (!scopePath) return null;
    const componentFsCache = new FsCache(scopePath);
    return componentFsCache.basePath;
  }

  private async clearScopeIndex() {
    try {
      const scopePath = findScopePath(process.cwd());
      if (!scopePath) return;
      await ScopeIndex.reset(scopePath);
      this.cacheCleared.push('scope-index file');
    } catch (err: any) {
      this.cacheClearedFailures.push(`scope-index file (err: ${err.message})`);
    }
  }
}

export async function clearCache(): Promise<CacheClearResult> {
  return new CacheClearer().clear();
}
