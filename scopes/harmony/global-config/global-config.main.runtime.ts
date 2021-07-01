import { MainRuntime } from '@teambit/cli';
import {
  del,
  delSync,
  get,
  getSync,
  list,
  listSync,
  set,
  setSync,
} from '@teambit/legacy/dist/api/consumer/lib/global-config';
import { GlobalConfig } from '@teambit/legacy/dist/global-config';
import { GlobalConfigAspect } from './global-config.aspect';

export class GlobalConfigMain {
  static runtime = MainRuntime;
  static dependencies = [];
  static slots = [];

  async get(key: string): Promise<string | undefined> {
    return get(key);
  }

  getSync(key: string): string | undefined {
    return getSync(key);
  }

  list(): Promise<Record<string, string>> {
    return list();
  }
  listSync(): Record<string, string> {
    return listSync();
  }

  async set(key: string, val: string): Promise<GlobalConfig> {
    return set(key, val);
  }
  setSync(key: string, val: string): GlobalConfig {
    return setSync(key, val);
  }

  async del(key: string): Promise<GlobalConfig> {
    return del(key);
  }

  delSync(key: string): GlobalConfig {
    return delSync(key);
  }

  static async provider() {
    const globalConfig = new GlobalConfigMain();
    return globalConfig;
  }
}

GlobalConfigAspect.addRuntime(GlobalConfigMain);
