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

export class FsCache {
  readonly basePath: PathOsBasedAbsolute;
  protected isNoFsCacheFeatureEnabled: boolean;
  // command-scoped index of component rootDir -> last-modified mtimeMs, used to invalidate the
  // dependencies fs-cache with a single workspace scan instead of a per-component one. invalidated
  // by the workspace's clearAllComponentsCache / clearComponentCache (e.g. on watch file changes).
  private componentsMtimeIndex?: Map<string, number>;
  private componentsMtimeIndexBuilding?: Promise<Map<string, number>>;
  private componentsMtimeIndexGen = 0;
  constructor(private scopePath: string) {
    this.basePath = path.join(this.scopePath, WORKSPACE_CACHE, COMPONENTS_CACHE);
    this.isNoFsCacheFeatureEnabled = isFeatureEnabled(NO_FS_CACHE_FEATURE);
  }

  /**
   * return the shared components last-modified index, building it once via `build` and memoizing it
   * for the lifetime of this cache (a command, or until invalidated). concurrent first-callers share
   * a single build.
   */
  async getOrBuildComponentsMtimeIndex(build: () => Promise<Map<string, number>>): Promise<Map<string, number>> {
    if (this.componentsMtimeIndex) return this.componentsMtimeIndex;
    if (!this.componentsMtimeIndexBuilding) {
      const gen = this.componentsMtimeIndexGen;
      const building = build()
        .then((index) => {
          // if the index was cleared/invalidated while building, don't cache this stale result as canonical.
          if (gen === this.componentsMtimeIndexGen) this.componentsMtimeIndex = index;
          return index;
        })
        .finally(() => {
          // clear on both success and failure so a transient build error doesn't poison future reads;
          // guard against clobbering a newer build started after an invalidation.
          if (this.componentsMtimeIndexBuilding === building) this.componentsMtimeIndexBuilding = undefined;
        });
      this.componentsMtimeIndexBuilding = building;
    }
    return this.componentsMtimeIndexBuilding;
  }

  /** drop the whole index (e.g. on a full workspace cache clear). */
  clearComponentsMtimeIndex() {
    this.componentsMtimeIndex = undefined;
    this.componentsMtimeIndexBuilding = undefined;
    this.componentsMtimeIndexGen += 1;
  }

  /** drop a single component's entry so its next load recomputes it (e.g. on a watch file change). */
  deleteComponentMtimeIndexEntry(rootDir: string) {
    this.componentsMtimeIndex?.delete(rootDir);
    // if a build is in flight it may already contain this now-stale entry; bump the generation so its
    // result won't be cached as canonical, forcing the next read to rebuild (and re-stat this component).
    if (this.componentsMtimeIndexBuilding) this.componentsMtimeIndexGen += 1;
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
    try {
      await cacache.rm.all(cacheDir);
    } catch (err: any) {
      if (err.code === 'ENOTEMPTY') {
        // it happens when one process is deleting the cache and another one is writing to it.
        // it rarely happens. if it happens, wait for a second and try again.
        logger.error(`failed deleting the cache directory ${cacheDir}. retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await cacache.rm.all(cacheDir);
      } else {
        throw err;
      }
    }
  }

  async deleteDependenciesDataCache(idStr: string) {
    await cacache.rm.entry(this.getCachePath(DEPS), idStr);
  }

  async listDependenciesDataCache() {
    return cacache.ls(this.getCachePath(DEPS));
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
