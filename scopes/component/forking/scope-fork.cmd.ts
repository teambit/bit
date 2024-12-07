import { Command, CommandOptions } from '@teambit/cli';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import chalk from 'chalk';
import { ForkingMain } from './forking.main.runtime';

export type ScopeForkOptions = {
  ast?: boolean;
  skipDependencyInstallation?: boolean;
};
export class ScopeForkCmd implements Command {
  name = 'fork <original-scope> [new-scope] [pattern]';
  arguments = [
    {
      name: 'original-scope',
      description: 'the original scope to fork',
    },
    {
      name: 'new-scope',
      description: 'the new scope to fork to, default to the default-scope of the workspace',
    },
    {
      name: 'pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  description = 'fork all components of the original-scope and refactor the source-code to use the new scope name';
  extendedDescription = 'optionally, provide [pattern] to limit the fork to specific components';
  options = [
    ['', 'ast', 'use ast to transform files instead of regex'],
    ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
  ] as CommandOptions;
  group = 'development';

  constructor(private forking: ForkingMain) {}

  async report([originalScope, newScope, pattern]: [string, string, string], options: ScopeForkOptions) {
    const forkedIds = await this.forking.forkScope(originalScope, newScope, pattern, options);
    const title = chalk.green(
      `successfully forked ${chalk.bold(originalScope)} into ${chalk.bold(
        newScope || forkedIds[0].scope
      )}. the following components were created`
    );
    return `${title}\n${forkedIds.map((id) => id.toString()).join('\n')}`;
  }
}
