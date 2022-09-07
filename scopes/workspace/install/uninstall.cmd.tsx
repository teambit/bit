import { Command, CommandOptions } from '@teambit/cli';

import { InstallMain } from './install.main.runtime';

export default class UninstallCmd implements Command {
  name = 'uninstall [packages...]';
  description = 'uninstall dependencies';
  alias = 'un';
  group = 'development';
  options = [] as CommandOptions;

  constructor(private install: InstallMain) {}

  async report([packages = []]: [string[]]) {
    await this.install.uninstallDependencies(packages);
    return '';
  }
}
