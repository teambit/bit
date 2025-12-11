import type { Command } from '@teambit/cli';
import { PATTERN_HELP, COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import chalk from 'chalk';
import type { Workspace } from '../workspace';

export class ScopeSetCmd implements Command {
  name = 'set <scope-name> [component-pattern]';
  description =
    'Sets the scope for specified component/s. If no component is specified, sets the default scope of the workspace';
  arguments = [
    { name: 'scope-name', description: 'name of the scope to set' },
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  options = [];
  group = 'component-config';
  extendedDescription = `default scopes for components are set in the bitmap file. the default scope for a workspace is set in the workspace.jsonc.
a component is set with a scope (as oppose to default scope) only once it is versioned.'

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
      `successfully set the workspace's default-scope to ${chalk.bold(scopeName)}. (previous scope was "${oldScope}")`
    );
  }
}
