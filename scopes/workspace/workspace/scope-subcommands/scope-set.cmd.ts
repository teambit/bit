import { Command } from '@teambit/cli';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class ScopeSetCmd implements Command {
  name = 'set <pattern> <scope-name>';
  description = 'set a scope name for component(s)';
  options = [];
  group = 'development';
  extendedDescription = `${PATTERN_HELP('scope set')}`;

  constructor(private workspace: Workspace) {}

  async report([pattern, scopeName]: [string, string]) {
    const componentsIds = await this.workspace.idsByPattern(pattern);
    const changedIds = await this.workspace.setDefaultScopeToComponents(componentsIds, scopeName);
    return chalk.green(`successfully set ${chalk.bold(scopeName)} as the default-scope for the following component(s):
${chalk.reset(changedIds.map((id) => id.toString()).join('\n'))}`);
  }
}
