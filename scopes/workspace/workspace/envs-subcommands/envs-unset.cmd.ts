import { Command } from '@teambit/cli';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import chalk from 'chalk';
import { Workspace } from '../workspace';

export class EnvsUnsetCmd implements Command {
  name = 'unset <pattern>';
  description = 'unset an environment from component(s) that was set by "bit env set"';
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
