import { Command } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class EnvsReplaceCmd implements Command {
  name = 'replace <current-env> <new-env>';
  description = 'replace an existing env with another env for all components using the old env';
  options = [];
  group = 'development';
  arguments = [
    { name: 'current-env', description: 'the component id of the env to be replaced' },
    { name: 'new-env', description: 'the component id of the new env' },
  ];
  examples = [
    {
      cmd: 'replace teambit.harmony/aspect teambit.harmony/node',
      description: "components configured to use the 'aspect' env will be configured to use the 'node' env, instead",
    },
  ];

  constructor(private workspace: Workspace) {}

  async report([currentEnv, newEnv]: [string, string]) {
    const currentEnvId = await this.workspace.resolveComponentId(currentEnv);
    const newEnvId = await this.workspace.resolveComponentId(newEnv);
    const changedComponentIds = await this.workspace.replaceEnvForAllComponents(currentEnvId, newEnvId);
    return `added ${chalk.bold(newEnvId.toString())} env to the following component(s):
${changedComponentIds.map((compId) => compId.toString()).join('\n')}`;
  }
}
