import gitconfig from '@teambit/gitconfig';
import R from 'ramda';
import Config from '../../../global-config/config';
import GeneralError from '../../../error/general-error';
import { BASE_DOCS_DOMAIN } from '../../../constants';

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

export function getSync(key: string): string | null | undefined {
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
  try {
    const gitVal = gitconfig.get.sync(key);
    return gitVal;
    // Ignore error from git config get
  } catch (err) {
    return undefined;
  }
}

export function list(): Promise<any> {
  return Config.load().then((config) => config.toPlainObject());
}

export function listSync(): any {
  const config = Config.loadSync();
  return config.toPlainObject();
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

function invalidateCache() {
  cache().set(null);
}
