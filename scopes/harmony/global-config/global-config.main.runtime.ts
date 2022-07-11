import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import {
  CACHE_ROOT,
  DEBUG_LOG,
  GLOBAL_SCOPE,
  GLOBAL_CONFIG,
  CFG_CAPSULES_ROOT_BASE_DIR,
  GLOBALS_DEFAULT_CAPSULES,
} from '@teambit/legacy/dist/constants';
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
import { GlobalsCmd } from './globals.cmd';

export class GlobalConfigMain {
  static runtime = MainRuntime;
  static dependencies = [CLIAspect];
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

  getGlobalCapsulesBaseDir() {
    return this.getSync(CFG_CAPSULES_ROOT_BASE_DIR) || GLOBALS_DEFAULT_CAPSULES;
  }

  getKnownGlobalDirs() {
    return {
      'Global Dir': CACHE_ROOT,
      'Log file': DEBUG_LOG,
      'Global Scope Dir': GLOBAL_SCOPE,
      'Config Dir': GLOBAL_CONFIG,
      'Capsules Dir': this.getGlobalCapsulesBaseDir(),
    };
  }

  static async provider([cli]: [CLIMain]) {
    const globalConfig = new GlobalConfigMain();
    cli.register(new GlobalsCmd(globalConfig));
    return globalConfig;
  }
}

GlobalConfigAspect.addRuntime(GlobalConfigMain);
