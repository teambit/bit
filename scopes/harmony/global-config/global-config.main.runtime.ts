import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import {
  CACHE_ROOT,
  DEBUG_LOG,
  GLOBAL_SCOPE,
  GLOBAL_CONFIG,
  CFG_CAPSULES_ROOT_BASE_DIR,
  GLOBALS_DEFAULT_CAPSULES,
} from '@teambit/legacy.constants';
import {
  delSync,
  setSync,
  invalidateCache,
  GlobalConfig,
} from '@teambit/legacy.global-config';
import { GlobalConfigAspect } from './global-config.aspect';
import { GlobalsCmd } from './globals.cmd';
import { SystemCmd, SystemLogCmd, SystemTailLogCmd } from './system.cmd';
import { RemoteCmd } from './remote-cmd';
import { ConfigStoreAspect, ConfigStoreMain } from '@teambit/config-store';

export class GlobalConfigMain {
  constructor(private configStore: ConfigStoreMain) {}

  /**
  * @deprecated use ConfigStore.getConfig instead.
  */
  async get(key: string): Promise<string | undefined> {
    return this.configStore.getConfig(key);
  }

  /**
  * @deprecated use ConfigStore.getConfigBoolean instead.
  */
  async getBool(key: string): Promise<boolean | undefined> {
    return this.configStore.getConfigBoolean(key);
  }

  /**
  * @deprecated use ConfigStore.getConfig instead.
  */
  getSync(key: string): string | undefined {
    return this.configStore.getConfig(key);
  }

  /**
  * @deprecated use ConfigStore.listConfig instead.
  */
  async list(): Promise<Record<string, string>> {
    return this.configStore.listConfig();
  }
  /**
  * @deprecated use ConfigStore.listConfig instead.
  */
  listSync(): Record<string, string> {
    return this.configStore.listConfig();
  }
  /**
  * @deprecated use ConfigStore.setConfig instead.
  */
  async set(key: string, val: string): Promise<void> {
    await this.configStore.setConfig(key, val);
  }
  /**
  * @deprecated use ConfigStore.setConfig instead.
  */
  setSync(key: string, val: string): GlobalConfig {
    return setSync(key, val);
  }
/**
  * @deprecated use ConfigStore.delConfig instead.
  */
  async del(key: string): Promise<void> {
    await this.configStore.delConfig(key);
  }
/**
  * @deprecated use ConfigStore.delConfig instead.
  */
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
  static runtime = MainRuntime;
  static dependencies = [CLIAspect, ConfigStoreAspect];
  static slots = [];
  static async provider([cli, configStore]: [CLIMain, ConfigStoreMain]) {
    const globalConfig = new GlobalConfigMain(configStore);
    const systemCmd = new SystemCmd();
    systemCmd.commands = [new SystemLogCmd(), new SystemTailLogCmd()];
    cli.register(new GlobalsCmd(globalConfig), systemCmd, new RemoteCmd());
    return globalConfig;
  }
}

GlobalConfigAspect.addRuntime(GlobalConfigMain);
