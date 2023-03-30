import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { RemoveMain } from './remove.main.runtime';

export type RecoverOptions = {
  skipDependencyInstallation?: boolean;
};

export class RecoverCmd implements Command {
  name = 'recover <component-name>';
  description = 'recover soft-removed component(s) from the workspace, or a remote scope';
  group = 'collaborate';
  options = [
    ['x', 'skip-dependency-installation', 'do not install packages in case of importing components'],
  ] as CommandOptions;
  loader = true;
  migration = true;

  constructor(private remove: RemoveMain) {}

  async report([componentName]: [string], options: RecoverOptions) {
    await this.remove.recover(componentName, options);
    return chalk.green(`successfully recovered ${componentName}`);
  }
}
