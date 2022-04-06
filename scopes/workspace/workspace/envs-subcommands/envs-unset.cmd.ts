import { Command } from '@teambit/cli';
import { PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { Workspace } from '../workspace';

export class EnvsUnsetCmd implements Command {
  name = 'unset <component>';
  description = 'unset an environment from component(s)';
  options = [];
  group = 'development';
  extendedDescription = `${PATTERN_HELP('env unset')}`;

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const componentIds = await this.workspace.idsByPattern(pattern);
    const { changed } = await this.workspace.unsetEnvFromComponents(componentIds);
    return `successfully removed env from the following component(s):
${changed.map((id) => id.toString()).join('\n')}`;
  }
}
