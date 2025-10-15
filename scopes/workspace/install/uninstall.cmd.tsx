import type { Command, CommandOptions } from '@teambit/cli';

import type { InstallMain } from './install.main.runtime';

export default class UninstallCmd implements Command {
  name = 'uninstall [packages...]';
  description = 'remove dependencies from workspace';
  extendedDescription = `removes specified packages from workspace.jsonc dependency policy and runs install to update node_modules.`;
  arguments = [{ name: 'packages...', description: 'list of package names to remove from workspace dependencies' }];
  alias = 'un';
  group = 'dependencies';
  options = [] as CommandOptions;

  constructor(private install: InstallMain) {}

  async report([packages = []]: [string[]]) {
    await this.install.uninstallDependencies(packages);
    return '';
  }
}
