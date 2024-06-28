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
  invalidateCache,
} from '@teambit/legacy/dist/api/consumer/lib/global-config';
import { GlobalConfig } from '@teambit/legacy/dist/global-config';
import { GlobalConfigAspect } from './global-config.aspect';
import { GlobalsCmd } from './globals.cmd';
import { SystemCmd, SystemLogCmd, SystemTailLogCmd } from './system.cmd';
import { ConfigCmd } from './config-cmd';

export class GlobalConfigMain {
  static runtime = MainRuntime;
  static dependencies = [CLIAspect];
  static slots = [];

  async get(key: string): Promise<string | undefined> {
    return get(key);
  }

  async getBool(key: string): Promise<boolean | undefined> {
    const result = await get(key);
    if (result === undefined || result === null) return undefined;
    if (typeof result === 'boolean') return result;
    if (result === 'true') return true;
    if (result === 'false') return false;
    throw new Error(`the configuration "${key}" has an invalid value "${result}". it should be boolean`);
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

  invalidateCache() {
    invalidateCache();
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
    const systemCmd = new SystemCmd();
    systemCmd.commands = [new SystemLogCmd(), new SystemTailLogCmd()];
    cli.register(new GlobalsCmd(globalConfig), systemCmd, new ConfigCmd());
    return globalConfig;
  }
}

GlobalConfigAspect.addRuntime(GlobalConfigMain);
