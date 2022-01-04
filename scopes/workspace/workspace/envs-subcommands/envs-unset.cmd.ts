import { Command } from '@teambit/cli';
import { EnvsMain } from '@teambit/envs';
import { Workspace } from '../workspace';

export class EnvsUnsetCmd implements Command {
  name = 'unset <pattern>';
  description = 'unset an environment from component(s)';
  options = [];
  group = 'development';

  constructor(private workspace: Workspace) {}

  async report([pattern]: [string]) {
    const components = await this.workspace.byPattern(pattern);
    const { changed } = await this.workspace.unsetEnvFromComponents(components);
    return `successfully removed env from the following component(s):
${changed.map((id) => id.toString()).join('\n')}`;
  }
}
