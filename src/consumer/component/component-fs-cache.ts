import cacache, { GetCacheObject } from 'cacache';
import path from 'path';
import { PathOsBasedAbsolute } from '../../utils/path';

const WORKSPACE_CACHE = '.bit.cache';
const COMPONENTS_CACHE = 'components-cache';
const LAST_TRACK = 'last-track';
const DOCS = 'docs';
const DEPS = 'deps';

export class ComponentFsCache {
  readonly basePath: PathOsBasedAbsolute;
  constructor(private workspacePath) {
    this.basePath = path.join(this.workspacePath, WORKSPACE_CACHE, COMPONENTS_CACHE);
  }

  async getLastTrackTimestamp(idStr: string): Promise<number> {
    const results = await this.getFromCacheIfExist(LAST_TRACK, idStr);
    return results ? parseInt(results.data.toString()) : 0;
  }

  async setLastTrackTimestamp(idStr: string, timestamp: number): Promise<void> {
    await this.saveDataInCache(idStr, LAST_TRACK, Buffer.from(timestamp.toString()));
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
    const cachePath = this.getCachePath(cacheName);
    try {
      const results = await cacache.get(cachePath, key);
      return results;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null; // cache doesn't exists
      }
      throw err;
    }
  }

  private getCachePath(cacheName: string) {
    return path.join(this.basePath, cacheName);
  }
}
