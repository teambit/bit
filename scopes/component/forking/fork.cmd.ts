import { Command, CommandOptions } from '@teambit/cli';
import { ComponentConfig } from '@teambit/generator';
import chalk from 'chalk';
import { ForkingMain } from './forking.main.runtime';

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
};

export class ForkCmd implements Command {
  name = 'fork <source-component-id> [target-component-name]';
  description = 'create a new component forked from an existing one (copies source files and configs)';
  helpUrl = 'docs/getting-started/collaborate/importing-components#fork-a-component';
  arguments = [
    { name: 'source-component-id', description: 'the component id of the source component' },
    {
      name: 'target-component-name',
      description:
        "the name for the new component (component name without scope, e.g. name/spaces/my-button). to set a different scope, use the '--scope' flag",
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
  ];
  loader = true;
  remoteOp = true;

  constructor(private forking: ForkingMain) {}

  async report([sourceId, targetId]: [string, string], options: ForkOptions): Promise<string> {
    const results = await this.forking.fork(sourceId, targetId, options);
    const targetIdStr = results.toString();
    return chalk.green(`successfully forked ${chalk.bold(targetIdStr)} from ${chalk.bold(sourceId)}`);
  }
}
