import chalk from 'chalk';
import { BitError } from '@teambit/bit-error';
import type { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { RemoveMain } from './remove.main.runtime';

export type RecoverOptions = {
  skipDependencyInstallation?: boolean;
  skipWriteConfigFiles?: boolean;
};

export class RecoverCmd implements Command {
  name = 'recover <component-pattern>';
  description = 'restore soft-deleted components';
  extendedDescription =
    'reverses the soft-deletion of components marked with "bit delete", restoring them to their previous state. works for both local and remote soft-deleted components. supports patterns like "comp1", "org.scope/*", etc.';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'collaborate';
  options = [
    ['x', 'skip-dependency-installation', 'do not install packages in case of importing components'],
    ['', 'skip-write-config-files', 'do not write config files (such as eslint, tsconfig, prettier, etc...)'],
  ] as CommandOptions;
  loader = true;

  constructor(private remove: RemoveMain) {}

  async report([componentPattern]: [string], options: RecoverOptions) {
    const recovered = await this.remove.recover(componentPattern, options);
    if (recovered.length === 0) {
      throw new BitError(`no soft-deleted components found matching pattern "${componentPattern}"`);
    }
    const recoveredStr = recovered.map((id) => id.toString()).join('\n');
    return `${chalk.green('successfully recovered the following component(s):')}\n${recoveredStr}`;
  }
}
