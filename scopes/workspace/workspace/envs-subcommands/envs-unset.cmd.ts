import { Command } from '@teambit/cli';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class EnvsUnsetCmd implements Command {
  name = 'unset <component-pattern>';
  description = 'un-sets an env from components that were previously set by "bit env set" or by a component template';
  arguments = [
    {
      name: 'component-pattern',
      description:
        'component name, component id, or component pattern. use component pattern to select multiple components. \nuse comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button"\nwrap the pattern with quotes',
    },
  ];
  options = [];
  group = 'development';
  extendedDescription = `keep in mind that this doesn't remove envs that are set in the variants.
in only removes envs that appear in the .bitmap file, which were previously configured via "bit env set".
the purpose of this command is to remove the specific settings and let the the variants in workspace.jsonc to control the env.
${PATTERN_HELP('env unset')}`;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const { changed } = await this.workspace.unsetEnvFromComponents(componentIds);
    if (!changed.length) {
      return chalk.yellow(`unable to find any component matching the pattern with env configured in the .bitmap file`);
    }
    return `successfully removed env from the following component(s):
${changed.map((id) => id.toString()).join('\n')}`;
  }
}
