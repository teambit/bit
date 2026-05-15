import type { Command, CommandOptions } from '@teambit/cli';
import { formatItem, formatSuccessSummary, joinSections } from '@teambit/cli';
import type { ComponentConfig } from '@teambit/generator';
import chalk from 'chalk';
import { hasWildcard } from '@teambit/legacy.utils';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { WorkspaceComponentLoadOptions } from '@teambit/workspace';
import type { ForkingMain } from './forking.main.runtime';
import { forkCommand } from './forking.commands';

export type ForkOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
  skipDependencyInstallation?: boolean;
  skipConfig?: boolean;
  preserve?: boolean;
  noLink?: boolean;
  env?: string;
  config?: ComponentConfig;
  ast?: boolean;
  compile?: boolean;
  loadOptions?: WorkspaceComponentLoadOptions;
};

export class ForkCmd implements Command {
  name = forkCommand.name;
  description = forkCommand.description;
  extendedDescription = forkCommand.extendedDescription;
  helpUrl = forkCommand.helpUrl;
  arguments = forkCommand.arguments;
  group = forkCommand.group;
  skipWorkspace = forkCommand.skipWorkspace;
  alias = forkCommand.alias;

  options = forkCommand.options;

  example: [
    {
      cmd: 'fork teambit.base-ui/input/button ui/button';
      description: "create a component named 'ui/button', forked from the remote 'input/button' component";
    },
    {
      cmd: 'fork "teambit.base-ui/**" --scope my-org.my-scope';
      description: 'fork all components from teambit.base-ui scope to my-org.my-scope';
    },
    {
      cmd: 'fork "my-org.utils/string/**"';
      description: 'fork all string utility components to the workspace default scope';
    },
  ];
  loader = forkCommand.loader;
  remoteOp = forkCommand.remoteOp;

  constructor(private forking: ForkingMain) {}

  async report([sourceId, targetId]: [string, string], options: ForkOptions): Promise<string> {
    const isPattern = hasWildcard(sourceId) || sourceId.includes(',');

    if (isPattern) {
      // Pattern mode - fork multiple components
      if (targetId) {
        throw new Error('target-component-name is not allowed when using patterns');
      }

      const results = await this.forking.forkByPattern(sourceId, options);
      const items = results.map((id) => formatItem(id.toString()));
      return joinSections([
        formatSuccessSummary(`forked ${results.length} component(s) matching pattern ${chalk.bold(sourceId)}`),
        items.join('\n'),
      ]);
    }

    // Single component mode - original behavior
    const result = await this.forking.fork(sourceId, targetId, options);
    const targetIdStr = result.toString();
    return formatSuccessSummary(`forked ${chalk.bold(targetIdStr)} from ${chalk.bold(sourceId)}`);
  }
}
