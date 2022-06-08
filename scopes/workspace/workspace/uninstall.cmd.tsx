import { Command, CommandOptions } from '@teambit/cli';

import { Workspace } from './workspace';

export default class UninstallCmd implements Command {
  name = 'uninstall [packages...]';
  description = 'uninstall dependencies';
  alias = 'un';
  group = 'development';
  options = [] as CommandOptions;

  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  async report([packages = []]: [string[]]) {
    await this.workspace.uninstallDependencies(packages);
    return '';
  }
}
