import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { DeprecationMain } from './deprecation.main.runtime';

export class DeprecateCmd implements Command {
  name = 'deprecate <component-name>';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  description = 'mark a component as deprecated to discourage its use';
  extendedDescription = `marks a component as deprecated locally, then after snap/tag and export it becomes deprecated in the remote scope.
optionally specify a replacement component or deprecate only specific version ranges.
deprecated components remain available but display warnings when installed or imported.`;
  group = 'collaborate';
  skipWorkspace = true;
  alias = 'd';
  options = [
    [
      '',
      'new-id <string>',
      'if replaced by another component, enter the new component id. alternatively use "bit rename --deprecate" to do this automatically',
    ],
    [
      '',
      'range <string>',
      'enter a Semver range to deprecate specific versions. see https://www.npmjs.com/package/semver#ranges for the range syntax',
    ],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;
  helpUrl = 'reference/components/removing-components';

  constructor(private deprecation: DeprecationMain) {}

  async report([id]: [string], { newId, range }: { newId?: string; range?: string }): Promise<string> {
    const result = await this.deprecate(id, newId, range);
    if (result) {
      return chalk.green(`the component "${id}" has been deprecated successfully`);
    }
    return chalk.bold(`the component "${id}" is already deprecated. no changes have been made`);
  }

  private async deprecate(id: string, newId?: string, range?: string): Promise<boolean> {
    return this.deprecation.deprecateByCLIValues(id, newId, range);
  }
}
