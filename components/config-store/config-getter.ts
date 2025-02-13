import gitconfig from '@teambit/gitconfig';
import { isNil } from 'lodash';
import { GlobalConfig } from '@teambit/legacy.global-config';

export const ENV_VARIABLE_CONFIG_PREFIX = 'BIT_CONFIG_';

export interface Store {
  list(): Record<string, string>;
  set(key: string, value: string): void;
  del(key: string): void;
  write(): Promise<void>;
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
    };
  }
}

export const configGetter = new ConfigGetter();

export function getConfig(key: string): string | undefined {
  return configGetter.getConfig(key);
}
export function getNumberFromConfig(key: string): number | null {
  const fromConfig = configGetter.getConfig(key);
  if (!fromConfig) return null;
  const num = Number(fromConfig);
  if (Number.isNaN(num)) {
    throw new Error(`config of "${key}" is invalid. Expected number, got "${fromConfig}"`);
  }
  return num;
}
export function listConfig(): Record<string, string> {
  return configGetter.listConfig();
}

function toEnvVariableName(configName: string): string {
  return `${ENV_VARIABLE_CONFIG_PREFIX}${configName.replace(/\./g, '_').toUpperCase()}`;
}
