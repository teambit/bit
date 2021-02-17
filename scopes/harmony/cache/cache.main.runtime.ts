import { MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { CACHE_ROOT } from '@teambit/legacy/dist/constants';
import cacache from 'cacache';

import { CacheAspect } from './cache.aspect';

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
      .put(this.globalCacheFolder, key, data)
      .then(() => true)
      .catch(() => false);
  }

  async get(key: string): Promise<string | null> {
    this.logger.debug(`get cache for ${key}`);
    return cacache
      .get(this.globalCacheFolder, key)
      .then((cacheObject) => {
        return cacheObject.data.toString();
      })
      .catch(() => null);
  }

  private get globalCacheFolder() {
    return this.config.cacheDirectory;
  }

  static async provider([loggerFactory]: [LoggerMain], config: CacheConfig) {
    const logger = loggerFactory.createLogger(CacheAspect.id);
    return new CacheMain(config, logger);
  }
}

CacheAspect.addRuntime(CacheMain);
