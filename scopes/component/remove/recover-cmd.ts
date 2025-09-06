import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import type { Command, CommandOptions } from '@teambit/cli';
import type { RemoveMain } from './remove.main.runtime';

export type RecoverOptions = {
  skipDependencyInstallation?: boolean;
  skipWriteConfigFiles?: boolean;
};

export class RecoverCmd implements Command {
  name = 'recover <component-name>';
  description = 'restore soft-deleted components';
  extendedDescription = 'reverses the soft-deletion of components marked with "bit delete", restoring them to their previous state. works for both local and remote soft-deleted components.';
  group = 'collaborate';
  options = [
    ['x', 'skip-dependency-installation', 'do not install packages in case of importing components'],
    ['', 'skip-write-config-files', 'do not write config files (such as eslint, tsconfig, prettier, etc...)'],
  ] as CommandOptions;
  loader = true;

  constructor(private remove: RemoveMain) {}

  async report([componentName]: [string], options: RecoverOptions) {
    const hasRecovered = await this.remove.recover(componentName, options);
    if (!hasRecovered) {
      throw new BitError(`component ${componentName} was not soft-deleted, nothing to recover`);
    }
    return chalk.green(`successfully recovered ${componentName}`);
  }
}
