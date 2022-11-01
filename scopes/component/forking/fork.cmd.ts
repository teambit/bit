import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ForkingMain } from '.';

export type ForkOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
  skipDependencyInstallation?: boolean;
};

export class ForkCmd implements Command {
  name = 'fork <source-component-id> [target-component-name]';
  description = 'EXPERIMENTAL. create a new component out of an existing one (copies source files and config)';
  helpUrl = 'docs/components/importing-components#forking-components';
  arguments = [
    { name: 'source-component-id', description: 'the component id of the source component' },
    {
      name: 'target-component-name',
      description:
        "the name for the new component (component name without scope). to set a different scope, use the '--scope' flag",
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
    ['', 'skip-dependency-installation', 'do not install packages of the imported components'],
  ] as CommandOptions;

  example: [
    {
      cmd: 'fork teambit.base-ui/input/button ui/button';
      description: "create a component named 'ui/button' out of the remote 'input/button' component";
    }
  ];
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private forking: ForkingMain) {}

  async report([sourceId, targetId]: [string, string], options: ForkOptions): Promise<string> {
    const results = await this.forking.fork(sourceId, targetId, options);
    const targetIdStr = results.toString();
    return chalk.green(`successfully forked ${chalk.bold(targetIdStr)} from ${chalk.bold(sourceId)}`);
  }
}
