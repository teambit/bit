import cacache, { GetCacheObject } from 'cacache';
import path from 'path';
import fs from 'fs-extra';
import { isFeatureEnabled, NO_FS_CACHE_FEATURE } from '../../api/consumer/lib/feature-toggle';
import { PathOsBasedAbsolute } from '../../utils/path';
import type { ComponentMapFile } from '../bit-map/component-map';

const WORKSPACE_CACHE = 'cache';
const COMPONENTS_CACHE = 'components';
const LAST_TRACK = 'last-track';
const DOCS = 'docs';
const DEPS = 'deps';
const FILE_PATHS = 'file-paths';

export class ComponentFsCache {
  readonly basePath: PathOsBasedAbsolute;
  private isNoFsCacheFeatureEnabled: boolean;
  constructor(private scopePath: string) {
    this.basePath = path.join(this.scopePath, WORKSPACE_CACHE, COMPONENTS_CACHE);
    this.isNoFsCacheFeatureEnabled = isFeatureEnabled(NO_FS_CACHE_FEATURE);
  }

  async getLastTrackTimestamp(idStr: string): Promise<number> {
    const results = await this.getFromCacheIfExist(LAST_TRACK, idStr);
    return results ? parseInt(results.data.toString()) : 0;
  }

  async setLastTrackTimestamp(idStr: string, timestamp: number): Promise<void> {
    await this.saveDataInCache(idStr, LAST_TRACK, Buffer.from(timestamp.toString()));
  }

  async getFilePathsFromCache(idStr: string): Promise<{ timestamp: number; data: string } | null> {
    return this.getStringDataFromCache(idStr, FILE_PATHS);
  }

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
    await cacache.put(cachePath, key, data, { metadata });
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
    } catch (err) {
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
