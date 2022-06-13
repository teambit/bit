import { Command } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class EnvsSetCmd implements Command {
  name = 'set <component-pattern> <env>';
  description = 'Sets one or more components with a development environment (env)';
  arguments = [
    {
      name: 'component-pattern',
      description:
        'component name, component id, or component pattern. use component pattern to select multiple components. \nuse commas to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button"\nwrap the pattern with quotes',
    },
    {
      name: 'env',
      description:
        "the env's component id (include version for non-core envs. e.g, `teambit.community/envs/community-react@1.95.13`)",
    },
  ];
  examples = [
    {
      cmd: 'set ui/button teambit.react/react',
      description: "configures 'ui/button' to use the 'teambit.react/react' env",
    },
    {
      cmd: 'set ui/button teambit.community/envs/community-mdx@1.95.16',
      description: "configures 'ui/button' to use the (non-core) 'teambit.community/envs/community-mdx@1.95.16' env",
    },
    {
      cmd: 'set "ui/**" teambit.react/react',
      description: "configures all components that have the 'ui' namespace to use the teambit.react/react env",
    },
  ];
  options = [];
  group = 'development';

  constructor(private workspace: Workspace) {}

  async report([pattern, env]: [string, string]) {
    const envId = await this.workspace.resolveComponentId(env);
    const componentIds = await this.workspace.idsByPattern(pattern);
    await this.workspace.setEnvToComponents(envId, componentIds);
    return `added ${chalk.bold(envId.toString())} env to the following component(s):
${componentIds.map((compId) => compId.toString()).join('\n')}`;
  }
}
