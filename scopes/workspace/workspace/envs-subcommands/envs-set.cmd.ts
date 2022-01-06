import { Command } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class EnvsSetCmd implements Command {
  name = 'set <pattern> <env>';
  description = 'set an environment to component(s)';
  options = [];
  group = 'development';

  constructor(private workspace: Workspace) {}

  async report([pattern, env]: [string, string]) {
    const envId = await this.workspace.resolveComponentId(env);
    const components = await this.workspace.byPattern(pattern);
    await this.workspace.setEnvToComponents(envId, components);
    return `added ${chalk.bold(envId.toString())} env to the following component(s):
${components.map((comp) => comp.id.toString()).join('\n')}`;
  }
}
