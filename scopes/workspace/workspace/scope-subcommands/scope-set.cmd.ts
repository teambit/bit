import { Command } from '@teambit/cli';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class ScopeSetCmd implements Command {
  name = 'set <scope-name> [pattern]';
  description = 'set the default-scope';
  options = [];
  group = 'development';
  extendedDescription = `set a new scope in the workspace.jsonc.
if "pattern" is provided, the default-scope will be set to the new components matching the criteria.

${PATTERN_HELP('scope set scope-name')}`;

  constructor(private workspace: Workspace) {}

  async report([scopeName, pattern]: [string, string]) {
    if (pattern) {
      const componentsIds = await this.workspace.idsByPattern(pattern);
      const changedIds = await this.workspace.setDefaultScopeToComponents(componentsIds, scopeName);
      return chalk.green(`successfully set ${chalk.bold(scopeName)} as the default-scope for the following component(s):
  ${chalk.reset(changedIds.map((id) => id.toString()).join('\n'))}`);
    }
    const oldScope = this.workspace.defaultScope;
    await this.workspace.setDefaultScope(scopeName);
    return chalk.green(
      `successfully set the default-scope to ${chalk.bold(scopeName)}. (previous scope was "${oldScope}")`
    );
  }
}
