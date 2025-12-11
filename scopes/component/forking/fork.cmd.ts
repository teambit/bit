import type { Command, CommandOptions } from '@teambit/cli';
import type { ComponentConfig } from '@teambit/generator';
import chalk from 'chalk';
import { hasWildcard } from '@teambit/legacy.utils';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { WorkspaceComponentLoadOptions } from '@teambit/workspace';
import type { ForkingMain } from './forking.main.runtime';

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
  name = 'fork <pattern> [target-component-name]';
  description = 'create a new component by copying from an existing one';
  extendedDescription = `duplicates an existing component's source files and configuration to create a new independent component.
useful for creating variations or starting development from a similar component.
automatically handles import/require statement updates and provides refactoring options.

when using a pattern, all matching components are forked with the same name to a target scope.
the target-component-name argument is not allowed when using patterns.`;
  helpUrl = 'docs/getting-started/collaborate/importing-components#fork-a-component';
  arguments = [
    {
      name: 'pattern',
      description: COMPONENT_PATTERN_HELP,
    },
    {
      name: 'target-component-name',
      description:
        "the name for the new component (component name without scope, e.g. name/spaces/my-button). to set a different scope, use the '--scope' flag. not allowed when using patterns",
    },
  ];
  group = 'collaborate';
  skipWorkspace = true;
  alias = '';

  options = [
    ['s', 'scope <string>', 'default scope for the new component'],
    [
      'p',
      'path <string>',
      'relative path in the workspace for the new component. by default the path is `<scope>/<namespace>/<name>`',
    ],
    ['r', 'refactor', 'update the import/require statements in all dependent components (in the same workspace)'],
    ['x', 'skip-dependency-installation', 'do not install packages of the imported components'],
    ['e', 'env <string>', 'set the environment for the new component'],
    [
      '',
      'skip-config',
      'do not copy the config (aspects-config, env, etc) to the new component. helpful when it fails during aspect loading',
    ],
    ['', 'preserve', 'avoid refactoring file and variable/class names according to the new component name'],
    ['', 'no-link', 'avoid saving a reference to the original component'],
    ['', 'ast', 'use ast to transform files instead of regex'],
  ] as CommandOptions;

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
  loader = true;
  remoteOp = true;

  constructor(private forking: ForkingMain) {}

  async report([sourceId, targetId]: [string, string], options: ForkOptions): Promise<string> {
    const isPattern = hasWildcard(sourceId) || sourceId.includes(',');

    if (isPattern) {
      // Pattern mode - fork multiple components
      if (targetId) {
        throw new Error('target-component-name is not allowed when using patterns');
      }

      const results = await this.forking.forkByPattern(sourceId, options);
      const title = chalk.green(
        `successfully forked ${chalk.bold(results.length)} component(s) matching pattern ${chalk.bold(sourceId)}`
      );
      return `${title}\n${results.map((id) => id.toString()).join('\n')}`;
    }

    // Single component mode - original behavior
    const result = await this.forking.fork(sourceId, targetId, options);
    const targetIdStr = result.toString();
    return chalk.green(`successfully forked ${chalk.bold(targetIdStr)} from ${chalk.bold(sourceId)}`);
  }
}
