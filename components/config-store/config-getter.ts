import gitconfig from '@teambit/gitconfig';
import { isNil } from 'lodash';
import { getGlobalConfigPath, GlobalConfig } from '@teambit/legacy.global-config';

export const ENV_VARIABLE_CONFIG_PREFIX = 'BIT_CONFIG_';

export interface Store {
  list(): Record<string, string>;
  set(key: string, value: string): void;
  del(key: string): void;
  write(): Promise<void>;
  getPath(): string;
  invalidateCache(): Promise<void>;
}

/**
 * Singleton cache for the config object. so it can be used everywhere even by non-aspects components.
 */
export class ConfigGetter {
  private _store: Record<string, string> | undefined;
  private _globalConfig: GlobalConfig | undefined;
  private gitStore: Record<string, string | undefined> = {};

  get globalConfig() {
    if (!this._globalConfig) {
      this._globalConfig = GlobalConfig.loadSync();
    }
    return this._globalConfig;
  }

  get store() {
    if (!this._store) {
      this._store = this.globalConfig.toPlainObject();
    }
    return this._store;
  }

  /**
   * in case a config-key exists in both, the new one (the given store) wins.
   */
  addStore(store: Store) {
    const currentStore = this.store;
    this._store = { ...currentStore, ...store.list() };
  }

  getConfig(key: string): string | undefined  {
    if (!key) {
      return undefined;
    }

    const envVarName = toEnvVariableName(key);
    if (process.env[envVarName]) {
      return process.env[envVarName];
    }

    const store = this.store;
    const val = store[key];
    if (!isNil(val)) {
      return val;
    }

    if (key in this.gitStore) {
      return this.gitStore[key];
    }
    try {
      const gitVal = gitconfig.get.sync(key);
      this.gitStore[key] = gitVal;
    } catch {
      // Ignore error from git config get
      this.gitStore[key] = undefined;
    }
    return this.gitStore[key];
  }
  getConfigNumeric(key: string): number | undefined {
    const fromConfig = this.getConfig(key);
    if (isNil(fromConfig)) return undefined;
    const num = Number(fromConfig);
    if (Number.isNaN(num)) {
      throw new Error(`config of "${key}" is invalid. Expected number, got "${fromConfig}"`);
    }
    return num;
  }
  getConfigBoolean(key: string): boolean | undefined {
    const result = this.getConfig(key);
    if (isNil(result)) return undefined;
    if (typeof result === 'boolean') return result;
    if (result === 'true') return true;
    if (result === 'false') return false;
    throw new Error(`the configuration "${key}" has an invalid value "${result}". it should be boolean`);
  }
  listConfig() {
    const store = this.store;
    return store;
  }
  invalidateCache() {
    this._store = undefined;
  }
  getGlobalStore(): Store {
    return {
      list: () => this.globalConfig.toPlainObject(),
      set: (key: string, value: string) => this.globalConfig.set(key, value),
      del: (key: string) => this.globalConfig.delete(key),
      write: async () => this.globalConfig.write(),
      invalidateCache: async () => this._globalConfig = undefined,
      getPath: () => getGlobalConfigPath(),
    };
  }
}

export const configGetter = new ConfigGetter();

export function getConfig(key: string): string | undefined {
  return configGetter.getConfig(key);
}
export function getNumberFromConfig(key: string): number | undefined {
  return configGetter.getConfigNumeric(key);
}
export function listConfig(): Record<string, string> {
  return configGetter.listConfig();
}
/**
 * @deprecated use setConfig from the ConfigStore aspect instance
 */
export function setGlobalConfig(key: string, val: string) {
  const globalStore = configGetter.getGlobalStore();
  globalStore.set(key, val);
  configGetter.globalConfig.writeSync();
  globalStore.invalidateCache().catch(() => {});
  configGetter.invalidateCache();
}
/**
 * @deprecated use delConfig from the ConfigStore aspect instance
 */
export function delGlobalConfig(key: string) {
  const globalStore = configGetter.getGlobalStore();
  globalStore.del(key);
  configGetter.globalConfig.writeSync();
  globalStore.invalidateCache().catch(() => {});
  configGetter.invalidateCache();
}

function toEnvVariableName(configName: string): string {
  return `${ENV_VARIABLE_CONFIG_PREFIX}${configName.replace(/\./g, '_').toUpperCase()}`;
}
