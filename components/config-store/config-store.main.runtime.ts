import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { compact } from 'lodash';
import { ConfigStoreAspect } from './config-store.aspect';
import type { Store } from './config-getter';
import { configGetter } from './config-getter';
import { ConfigCmd } from './config-cmd';

export type StoreOrigin = 'scope' | 'workspace' | 'global';

export class ConfigStoreMain {
  private _stores: { [origin: string]: Store } | undefined;
  get stores(): { [origin: string]: Store } {
    if (!this._stores) {
      this._stores = {
        global: configGetter.getGlobalStore(),
      };
    }
    return this._stores;
  }
  addStore(origin: StoreOrigin, store: Store) {
    this.stores[origin] = store;
    configGetter.addStore(store);
  }
  /**
   * "global" must be first. the rest doesn't matter. can be scope or workspace.
   */
  getStoresOrdered(): Store[] {
    return compact([this.stores.global, this.stores.workspace, this.stores.scope].filter(Boolean)) as Store[];
  }
  invalidateCache() {
    configGetter.invalidateCache();
    const stores = this.getStoresOrdered();
    stores.forEach((store) => {
      configGetter.addStore(store);
    });
  }
  async invalidateAllStoresCaches() {
    configGetter.invalidateCache();
    const stores = this.getStoresOrdered();
    for await (const store of stores) {
      await store.invalidateCache();
      configGetter.addStore(store);
    }
  }
  async setConfig(key: string, value: string, origin: StoreOrigin = 'global') {
    const store = this.stores[origin];
    if (!store) throw new Error(`unable to set config, "${origin}" origin is missing`);
    store.set(key, value);
    await store.write();
    await this.invalidateCache();
  }
  getConfig(key: string): string | undefined {
    return configGetter.getConfig(key);
  }
  getConfigBoolean(key: string): boolean | undefined {
    return configGetter.getConfigBoolean(key);
  }
  getConfigNumeric(key: string): number | undefined {
    return configGetter.getConfigNumeric(key);
  }
  async delConfig(key: string, origin?: StoreOrigin) {
    const getOrigin = () => {
      if (origin) return origin;
      return Object.keys(this.stores).find((originName) => key in this.stores[originName].list());
    };
    const foundOrigin = getOrigin();
    if (!foundOrigin) return; // if the key is not found in any store (or given store), nothing to do.
    const store = this.stores[foundOrigin];
    store.del(key);
    await store.write();
    await this.invalidateCache();
  }
  listConfig() {
    return configGetter.listConfig();
  }

  static slots = [];
  static dependencies = [CLIAspect];
  static runtime = MainRuntime;
  static async provider([cli]: [CLIMain]) {
    const configStore = new ConfigStoreMain();
    cli.register(new ConfigCmd(configStore));
    return configStore;
  }
}

ConfigStoreAspect.addRuntime(ConfigStoreMain);

export default ConfigStoreMain;
