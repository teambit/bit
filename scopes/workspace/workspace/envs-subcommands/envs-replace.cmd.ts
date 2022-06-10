import { Command } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class EnvsReplaceCmd implements Command {
  name = 'replace <old-env> <new-env>';
  description = 'replace an existing env with another env for all components using the old env';
  options = [];
  group = 'development';
  arguments = [
    { name: 'old-env', description: 'current environment id' },
    { name: 'new-env', description: 'target environment id' },
  ];

  constructor(private workspace: Workspace) {}

  async report([oldEnv, env]: [string, string]) {
    const envId = await this.workspace.resolveComponentId(env);
    const components = await this.workspace.getComponentsUsingEnv(oldEnv, true, true);
    const componentIds = components.map((comp) => comp.id);
    await this.workspace.setEnvToComponents(envId, componentIds);
    return `added ${chalk.bold(envId.toString())} env to the following component(s):
${componentIds.map((compId) => compId.toString()).join('\n')}`;
  }
}
