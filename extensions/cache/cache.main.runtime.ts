import { MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import findCacheDir from 'find-cache-dir';
import { CACHE_ROOT } from 'bit-bin/dist/constants';
import cacache from 'cacache';

import { CacheAspect } from './cache.aspect';
import { CacheNotFoundError } from './cache-not-found-error';

export type CacheConfig = {
  cacheDirectory: string;
};

export class CacheMain {
  static runtime = MainRuntime;

  constructor(
    /**
     * extension config
     */
    readonly config: CacheConfig,

    /**
     * logger extension.
     */
    private readonly logger: Logger
  ) {}

  static dependencies = [LoggerAspect];

  static defaultConfig = {
    cacheDirectory: CACHE_ROOT,
  };

  async set(key: string, data: string): Promise<boolean> {
    this.logger.debug(`put cache to ${key} with data ${data}`);
    return cacache
      .put(this.getCacheFolder(CacheAspect.id, { global: true }), key, data)
      .then(() => true)
      .catch(() => false);
  }

  async get(key: string): Promise<string | null> {
    this.logger.debug(`get cache for ${key}`);
    return cacache
      .get(this.getCacheFolder(CacheAspect.id, { global: true }), key)
      .then((cacheObject) => {
        return cacheObject.data.toString();
      })
      .catch(() => null);
  }

  getCacheFolder(aspectId: string, { global = false } = {}) {
    if (global) return this.config.cacheDirectory;

    const cacheFolder = findCacheDir({ name: aspectId, create: true });
    if (!cacheFolder) throw new CacheNotFoundError();
    return cacheFolder;
  }

  static async provider([loggerFactory]: [LoggerMain], config: CacheConfig) {
    const logger = loggerFactory.createLogger(CacheAspect.id);
    return new CacheMain(config, logger);
  }
}

CacheAspect.addRuntime(CacheMain);
