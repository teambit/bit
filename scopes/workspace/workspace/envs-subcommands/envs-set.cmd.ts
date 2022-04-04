import { Command } from '@teambit/cli';
import chalk from 'chalk';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Workspace } from '../workspace';

export class EnvsSetCmd implements Command {
  name = 'set <pattern> <env>';
  description = 'set an environment for component(s)';
  options = [];
  group = 'development';
  extendedDescription = `${PATTERN_HELP('env set')}`;

  constructor(private workspace: Workspace) {}

  async report([pattern, env]: [string, string]) {
    const envId = await this.workspace.resolveComponentId(env);
    const componentIds = await this.workspace.idsByPattern(pattern);
    await this.workspace.setEnvToComponents(envId, componentIds);
    return `added ${chalk.bold(envId.toString())} env to the following component(s):
${componentIds.map((compId) => compId.toString()).join('\n')}`;
  }
}
