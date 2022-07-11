import { Command } from '@teambit/cli';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class ScopeSetCmd implements Command {
  name = 'set <scope-name> [component-pattern]';
  description =
    'Sets components with a default-scope. If no component is specified, sets the workspace with a default scope';
  arguments = [
    { name: 'scope-name', description: 'the scope name to use as the default scope' },
    {
      name: 'component-pattern',
      description:
        'component name, component id, or component pattern. use component pattern to select multiple components. \nuse comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button"\nwrap the pattern with quotes',
    },
  ];
  options = [];
  group = 'development';
  extendedDescription = `default scopes for components are set in the bitmap file. the default scope for a workspace is set in the workspace.jsonc. a component is set with a scope (as oppose to default scope) only once it is versioned.'

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
