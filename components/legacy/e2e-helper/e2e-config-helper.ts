import { forEach } from 'lodash';

import { getCloudDomain, CFG_GIT_EXECUTABLE_PATH } from '@teambit/legacy.constants';
import type CommandHelper from './e2e-command-helper';

export default class ConfigHelper {
  command: CommandHelper;
  constructor(command: CommandHelper) {
    this.command = command;
  }

  setHubDomain(domain = `hub.${getCloudDomain()}`) {
    this.command.setConfig('hub_domain', domain);
  }

  getGitPath() {
    this.command.getConfig(CFG_GIT_EXECUTABLE_PATH);
  }

  setGitPath(gitPath = 'git') {
    this.command.setConfig(CFG_GIT_EXECUTABLE_PATH, gitPath);
  }

  deleteGitPath() {
    this.command.delConfig(CFG_GIT_EXECUTABLE_PATH);
  }

  restoreGitPath(oldGitPath: string | null | undefined): any {
    if (!oldGitPath) {
      return this.deleteGitPath();
    }
    return this.setGitPath(oldGitPath);
  }

  backupConfigs(names: string[]): Record<string, any> {
    const backupObject: Record<string, any> = {};
    names.forEach((name) => {
      backupObject[name] = this.command.getConfig(name);
    });
    return backupObject;
  }

  restoreConfigs(backupObject: { [key: string]: string }): void {
    forEach(backupObject, (val, key) => {
      if (val === undefined || val.includes('undefined')) {
        this.command.delConfig(key);
      } else {
        this.command.setConfig(key, val);
      }
    });
  }
}
