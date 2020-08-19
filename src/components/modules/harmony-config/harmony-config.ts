import { stringify, assign } from 'comment-json';
import { join } from 'path';
import { readConfigFile } from './config-reader';

const userHome = require('user-home');

export type ConfigOptions = {
  cwd?: string;
  global?: GlobalConfigOpts;
  shouldThrow?: boolean;
};

export type GlobalConfigOpts = {
  dir?: string;
  name: string;
};

const defaultConfig = {
  cwd: process.cwd(),
  shouldThrow: true,
};

export class HarmonyConfig {
  constructor(private raw: Record<string, any>) {}

  toObject() {
    return this.raw;
  }

  toString() {
    return stringify(this.raw);
  }

  static load(fileName: string, opts?: ConfigOptions) {
    const mergedOpts = Object.assign(defaultConfig, opts);
    const config = readConfigFile(join(mergedOpts.cwd, fileName), mergedOpts.shouldThrow);

    if (mergedOpts.global) {
      return HarmonyConfig.loadGlobal(mergedOpts.global, config);
    }

    return new HarmonyConfig(config);
  }

  static loadGlobal(globalOpts: GlobalConfigOpts, config: any = {}) {
    const globalConfig = readConfigFile(join(globalOpts.dir || userHome, globalOpts.name), false);
    return new HarmonyConfig(assign(config, globalConfig));
  }
}
