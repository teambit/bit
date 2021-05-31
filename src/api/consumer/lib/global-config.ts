import gitconfig from 'gitconfig';
import R from 'ramda';
import { BASE_DOCS_DOMAIN } from '../../../constants';
import GeneralError from '../../../error/general-error';
import Config from '../../../global-config/config';

export function set(key: string, val: string): Promise<Config> {
  if (!key || !val) {
    throw new GeneralError(`missing a configuration key and value. https://${BASE_DOCS_DOMAIN}/docs/conf-config`);
  }
  return Config.load().then((config) => {
    config.set(key, val);
    invalidateCache();
    return config.write().then(() => config);
  });
}

export function setSync(key: string, val: string): Config {
  const config = Config.loadSync();
  config.set(key, val);
  invalidateCache();
  config.writeSync();
  return config;
}

export function del(key: string): Promise<Config> {
  return Config.load().then((config) => {
    config.delete(key);
    invalidateCache();
    return config.write().then(() => config);
  });
}

export function delSync(key: string): Config {
  const config = Config.loadSync();
  config.delete(key);
  config.writeSync();
  invalidateCache();
  return config;
}

export async function get(key: string): Promise<string | undefined> {
  const getConfigObject = async () => {
    const configFromCache = cache().get();
    if (configFromCache) return configFromCache;
    const config = await Config.load();
    cache().set(config);
    return config;
  };
  const config = await getConfigObject();
  const val = config ? config.get(key) : undefined;
  if (!R.isNil(val)) return val;
  try {
    const gitVal = await gitconfig.get(key);
    return gitVal;
    // Ignore error from git config get
  } catch (err) {
    return undefined;
  }
}

export function getSync(key: string): string | undefined {
  const getConfigObject = () => {
    const configFromCache = cache().get();
    if (configFromCache) return configFromCache;
    const config = Config.loadSync();
    cache().set(config);
    return config;
  };
  const config = getConfigObject();
  const val = config ? config.get(key) : undefined;
  if (!R.isNil(val)) return val;
  const gitConfigCache = gitCache().get() || {};
  if (key in gitConfigCache) {
    return gitConfigCache[val];
  }
  try {
    const gitVal = gitconfig.get.sync(key);
    gitConfigCache[key] = gitVal;
  } catch (err) {
    // Ignore error from git config get
    gitConfigCache[key] = undefined;
  }
  gitCache().set(gitConfigCache);
  return gitConfigCache[key];
}

export function list(): Promise<any> {
  return Config.load().then((config) => config.toPlainObject());
}

export function listSync(): any {
  const config = Config.loadSync();
  return config.toPlainObject();
}

export function getNumberFromConfig(name: string): number | null {
  const fromConfig = getSync(name);
  if (!fromConfig) return null;
  const num = Number(fromConfig);
  if (Number.isNaN(num)) {
    throw new Error(`config of "${name}" is invalid. Expected number, got "${fromConfig}"`);
  }
  return num;
}

function cache() {
  return {
    get: () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return cache.config;
    },
    set: (config) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      cache.config = config;
    },
  };
}

function gitCache() {
  return {
    get: () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return gitCache.config;
    },
    set: (config) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      gitCache.config = config;
    },
  };
}

function invalidateCache() {
  cache().set(null);
}
