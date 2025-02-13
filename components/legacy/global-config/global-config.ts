import gitconfig from '@teambit/gitconfig';
import { isNil } from 'lodash';
import { BitError } from '@teambit/bit-error';
import Config from './config';

export const ENV_VARIABLE_CONFIG_PREFIX = 'BIT_CONFIG_';

/**
 * @deprecated use ConfigStore "setConfig" API instead
 */
export function set(key: string, val: string): Promise<Config> {
  if (!key || !val) {
    throw new BitError(`missing a configuration key and value. https://bit.dev/config/bit-config`);
  }
  return Config.load().then((config) => {
    config.set(key, val);
    invalidateCache();
    return config.write().then(() => config);
  });
}

/**
 * @deprecated use ConfigStore "setConfig" API instead
 */
export function setSync(key: string, val: string): Config {
  const config = Config.loadSync();
  config.set(key, val);
  invalidateCache();
  config.writeSync();
  return config;
}

/**
 * @deprecated use ConfigStore "delConfig" API instead
 */
export function del(key: string): Promise<Config> {
  return Config.load().then((config) => {
    config.delete(key);
    invalidateCache();
    return config.write().then(() => config);
  });
}

/**
 * @deprecated use ConfigStore "delConfig" API instead
 */
export function delSync(key: string): Config {
  const config = Config.loadSync();
  config.delete(key);
  config.writeSync();
  invalidateCache();
  return config;
}

/**
 * @deprecated use "getConfig" from '@teambit/config-store';
 */
export async function get(key: string): Promise<string | undefined> {
  if (!key) return undefined;
  const getConfigObject = async () => {
    const configFromCache = cache().get();
    if (configFromCache) return configFromCache;
    const config = await Config.load();
    cache().set(config);
    return config;
  };
  const envVarName = toEnvVariableName(key);
  if (process.env[envVarName]) {
    return process.env[envVarName];
  }
  const config = await getConfigObject();
  const val = config ? config.get(key) : undefined;
  if (!isNil(val)) return val;
  try {
    const gitVal = await gitconfig.get(key);
    return gitVal;
    // Ignore error from git config get
  } catch {
    return undefined;
  }
}

/**
 * @deprecated use "getConfig" from '@teambit/config-store';
 */
export function getSync(key: string): string | undefined {
  if (!key) return undefined;
  const getConfigObject = () => {
    const configFromCache = cache().get();
    if (configFromCache) return configFromCache;
    const config = Config.loadSync();
    cache().set(config);
    return config;
  };
  const envVarName = toEnvVariableName(key);
  if (process.env[envVarName]) {
    return process.env[envVarName];
  }
  const config = getConfigObject();
  const val = config ? config.get(key) : undefined;
  if (!isNil(val)) return val;
  const gitConfigCache = gitCache().get() || {};
  if (key in gitConfigCache) {
    return gitConfigCache[key];
  }
  try {
    const gitVal = gitconfig.get.sync(key);
    gitConfigCache[key] = gitVal;
  } catch {
    // Ignore error from git config get
    gitConfigCache[key] = undefined;
  }
  gitCache().set(gitConfigCache);
  return gitConfigCache[key];
}

/**
 * @deprecated use "listConfig" from '@teambit/config-store';
 */
export function list(): Promise<any> {
  return Config.load().then((config) => config.toPlainObject());
}

/**
 * @deprecated use "listConfig" from '@teambit/config-store';
 */
export function listSync(): any {
  const config = Config.loadSync();
  return config.toPlainObject();
}

/**
 * @deprecated use "getNumberFromConfig" from '@teambit/config-store';
 */
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

/**
 * @deprecated use ConfigStore "invalidateCache" API instead
 */
export function invalidateCache() {
  cache().set(null);
}

function toEnvVariableName(configName: string): string {
  return `${ENV_VARIABLE_CONFIG_PREFIX}${configName.replace(/\./g, '_').toUpperCase()}`;
}
