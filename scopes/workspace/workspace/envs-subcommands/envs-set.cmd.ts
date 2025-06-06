import { Command } from '@teambit/cli';
import chalk from 'chalk';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { Workspace } from '../workspace';

export const installAfterEnvChangesMsg = chalk.yellow("please run 'bit install' for the changes to take effect");

export class EnvsSetCmd implements Command {
  name = 'set <component-pattern> <env>';
  description = 'Assigns one or more components a development environment (env)';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
    {
      name: 'env',
      description:
        "the env's component id (include version if not latest, e.g `teambit.community/envs/community-react@1.95.13`)",
    },
  ];
  examples = [
    {
      cmd: 'set ui/button teambit.react/react-env',
      description: "configures 'ui/button' to use the latest version of the 'teambit.react/react-env' env",
    },
    {
      cmd: 'set ui/button teambit.community/envs/community-mdx@1.95.16',
      description: "configures 'ui/button' to use the 'teambit.community/envs/community-mdx@1.95.16' env",
    },
    {
      cmd: 'set "*/ui/**" teambit.react/react-env',
      description:
        "configures all components that have the 'ui' namespace to use the latest version of the teambit.react/react-env env",
    },
  ];
  options = [];
  group = 'component-config';

  constructor(private workspace: Workspace) {}

  async report([pattern, env]: [string, string]) {
    const envId = await this.workspace.resolveComponentId(env);
    const componentIds = await this.workspace.idsByPattern(pattern);
    await this.workspace.setEnvToComponents(envId, componentIds);
    return `assigned ${chalk.bold(envId.toString())} env to the following component(s):
${componentIds.map((compId) => compId.toString()).join('\n')}\n
${installAfterEnvChangesMsg}`;
  }
}
