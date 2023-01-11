import { Command } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class EnvsUpdateCmd implements Command {
  name = 'update [env-id] [pattern]';
  description = 'update a version of an env for all components using that env';
  arguments = [
    {
      name: 'env-id',
      description:
        'the environment id (defaults to all envs). optionally, add a version (id@version), otherwise, it finds the latest version on the remote.',
    },
    {
      name: 'pattern',
      description:
        'the components to update (defaults to all components). use component name, component id, or component pattern. use component pattern to select multiple components. use comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button". wrap the pattern with quotes',
    },
  ];
  examples = [
    {
      cmd: 'envs update',
      description: 'update all envs in the workspace to their latest version',
    },
    {
      cmd: "envs update scope.org/env '**/ui/**'",
      description: 'update "ui" components that use scope.org/env to use its latest version',
    },
    {
      cmd: 'envs update scope.org/env@2.0.0',
      description: 'update all components that use scope.org/env to version 2.0.0 (of this env).',
    },
  ];
  options = [];
  group = 'development';

  constructor(private workspace: Workspace) {}

  async report([aspectId, pattern]: [string, string]) {
    const { updated, alreadyUpToDate } = await this.workspace.updateEnvForComponents(aspectId, pattern);
    if (Object.keys(updated).length) {
      const body = Object.keys(updated)
        .map((envId) => {
          return `${chalk.bold(envId)}:\n${updated[envId].map((compId) => compId.toString()).join('\n')}`;
        })
        .join('\n\n');
      const title = chalk.green(`the following component(s) have been successfully updated:\n`);
      return title + body;
    }
    if (alreadyUpToDate.length) {
      return chalk.green(
        `all ${alreadyUpToDate.length} component(s) that use this env are already up to date. nothing to update`
      );
    }
    return chalk.yellow(`unable to find any component that use ${chalk.bold(aspectId)}`);
  }
}
