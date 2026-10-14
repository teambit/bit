import type { GetCacheObject } from 'cacache';
import cacache from 'cacache';
import path from 'path';
import fs from 'fs-extra';
import { isFeatureEnabled, NO_FS_CACHE_FEATURE } from '@teambit/harmony.modules.feature-toggle';
import type { PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { logger } from '@teambit/legacy.logger';

const WORKSPACE_CACHE = 'cache';
const COMPONENTS_CACHE = 'components';
const DOCS = 'docs';
const DEPS = 'deps';
const RETRYABLE_FS_ERRORS = ['ENOTEMPTY', 'EPERM', 'EBUSY'];
const FS_MAX_ATTEMPTS = 10;
const FS_RETRY_DELAY_MS = 100;

export class FsCache {
  readonly basePath: PathOsBasedAbsolute;
  protected isNoFsCacheFeatureEnabled: boolean;
  constructor(private scopePath: string) {
    this.basePath = path.join(this.scopePath, WORKSPACE_CACHE, COMPONENTS_CACHE);
    this.isNoFsCacheFeatureEnabled = isFeatureEnabled(NO_FS_CACHE_FEATURE);
  }

  async getDocsFromCache(filePath: string): Promise<{ timestamp: number; data: string } | null> {
    return this.getStringDataFromCache(filePath, DOCS);
  }

  async saveDocsInCache(filePath: string, docs: Record<string, any>) {
    await this.saveStringDataInCache(filePath, DOCS, docs);
  }

  async getDependenciesDataFromCache(idStr: string): Promise<{ timestamp: number; data: string } | null> {
    return this.getStringDataFromCache(idStr, DEPS);
  }

  async saveDependenciesDataInCache(idStr: string, dependenciesData: string) {
    const metadata = { timestamp: Date.now() };
    await this.saveDataInCache(idStr, DEPS, dependenciesData, metadata);
  }

  async deleteAllDependenciesDataCache() {
    const cacheDir = this.getCachePath(DEPS);
    // the deps cache dir holds nothing else, so removing it entirely equals cacache.rm.all.
    // components keep reading/writing entries while it's deleted (loaded in parallel, or by another
    // process), which fails the rmdir: ENOTEMPTY on posix, EPERM/EBUSY on Windows (also when an
    // antivirus/indexer holds a handle). all of these are transient, so retry with a linear backoff.
    cacache.clearMemoized();
    await this.retryOnTransientFsError(() => fs.remove(cacheDir), `deleting the cache directory ${cacheDir}`);
  }

  async deleteDependenciesDataCache(idStr: string) {
    await cacache.rm.entry(this.getCachePath(DEPS), idStr);
  }

  async listDependenciesDataCache() {
    const cacheDir = this.getCachePath(DEPS);
    // listing reads every index bucket. if the dir is deleted meanwhile (by another loader or process), a missing
    // bucket is fine (cacache ignores ENOENT), but on Windows a bucket that is pending deletion fails readdir with
    // EPERM. it's transient as well, so retry the same way as the deletion.
    return this.retryOnTransientFsError(() => cacache.ls(cacheDir), `listing the cache directory ${cacheDir}`);
  }

  private async retryOnTransientFsError<T>(fn: () => Promise<T>, description: string): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (!RETRYABLE_FS_ERRORS.includes(err.code) || attempt >= FS_MAX_ATTEMPTS) throw err;
        logger.debug(`failed ${description} (${err.code}), retrying (attempt ${attempt})`);
        await new Promise((resolve) => setTimeout(resolve, FS_RETRY_DELAY_MS * attempt));
      }
    }
  }

  private async saveStringDataInCache(key: string, cacheName: string, data: any) {
    const dataBuffer = Buffer.from(JSON.stringify(data));
    const metadata = { timestamp: Date.now() };
    await this.saveDataInCache(key, cacheName, dataBuffer, metadata);
  }

  private async saveDataInCache(key: string, cacheName: string, data: any, metadata?: any) {
    if (this.isNoFsCacheFeatureEnabled) return;
    const cachePath = this.getCachePath(cacheName);
    try {
      await cacache.put(cachePath, key, data, { metadata });
    } catch (err) {
      logger.error(`failed caching ${key} in ${cachePath}`, err);
    }
  }

  private async getStringDataFromCache(
    key: string,
    cacheName: string
  ): Promise<{ timestamp: number; data: string } | null> {
    const results = await this.getFromCacheIfExist(cacheName, key);
    if (!results) return null;
    return { timestamp: results.metadata.timestamp, data: results.data.toString() };
  }

  private async getFromCacheIfExist(cacheName: string, key: string): Promise<GetCacheObject | null> {
    if (this.isNoFsCacheFeatureEnabled) return null;
    const cachePath = this.getCachePath(cacheName);
    try {
      const results = await cacache.get(cachePath, key);
      return results;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null; // cache doesn't exists
      }
      if (err.code === 'EINTEGRITY') {
        fs.removeSync(cachePath);
        return null;
      }
      throw err;
    }
  }

  private getCachePath(cacheName: string) {
    return path.join(this.basePath, cacheName);
  }
}
