import cacache, { GetCacheObject } from 'cacache';
import path from 'path';
import fs from 'fs-extra';
import { isFeatureEnabled, NO_FS_CACHE_FEATURE } from '@teambit/harmony.modules.feature-toggle';
import { PathOsBasedAbsolute } from '../../utils/path';
import type { ComponentMapFile } from '../bit-map/component-map';
import logger from '../../logger/logger';

const WORKSPACE_CACHE = 'cache';
const COMPONENTS_CACHE = 'components';
const DOCS = 'docs';
const DEPS = 'deps';
const VERSIONS = 'versions';
const FILE_PATHS = 'file-paths';

export class ComponentFsCache {
  readonly basePath: PathOsBasedAbsolute;
  private isNoFsCacheFeatureEnabled: boolean;
  constructor(private scopePath: string) {
    this.basePath = path.join(this.scopePath, WORKSPACE_CACHE, COMPONENTS_CACHE);
    this.isNoFsCacheFeatureEnabled = isFeatureEnabled(NO_FS_CACHE_FEATURE);
  }

  /**
   * @deprecated
   * not in use anymore. it takes time to save and get them from the cache, and it's faster to get them from the filesystem directly.
   */
  async getFilePathsFromCache(idStr: string): Promise<{ timestamp: number; data: string } | null> {
    return this.getStringDataFromCache(idStr, FILE_PATHS);
  }

  /**
   * @deprecated
   * not in use anymore. it takes time to save and get them from the cache, and it's faster to get them from the filesystem directly.
   */
  async saveFilePathsInCache(idStr: string, filePaths: ComponentMapFile[]): Promise<void> {
    await this.saveStringDataInCache(idStr, FILE_PATHS, filePaths);
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
    await cacache.rm.all(this.getCachePath(DEPS));
  }

  async deleteDependenciesDataCache(idStr: string) {
    await cacache.rm.entry(this.getCachePath(DEPS), idStr);
  }

  async listDependenciesDataCache() {
    return cacache.ls(this.getCachePath(DEPS));
  }

  async getVersionsDataFromCache(idStr: string): Promise<{ timestamp: number; data: string } | null> {
    return this.getStringDataFromCache(idStr, VERSIONS);
  }

  async saveVersionsDataInCache(idStr: string, versions: string) {
    const metadata = { timestamp: Date.now() };
    await this.saveDataInCache(idStr, VERSIONS, versions, metadata);
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
