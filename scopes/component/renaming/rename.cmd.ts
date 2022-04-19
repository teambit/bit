import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { RenamingMain } from '.';

export type RenameOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
};

export class RenameCmd implements Command {
  name = 'rename <source-name> <target-name>';
  description =
    'EXPERIMENTAL. rename component. if tagged/exported, create a new component and deprecate the source-component';
  extendedDescription = `the \`<target-name>\` should include the component-name only, without the scope-name.
to assign a default-scope to this component, please use "--scope" flag`;
  group = 'collaborate';
  skipWorkspace = true;
  alias = '';
  options = [
    ['s', 'scope <string>', 'default scope for the newly created component'],
    ['p', 'path <string>', 'relative path in the workspace. by default the path is `<scope>/<namespace>/<name>`'],
    ['r', 'refactor', 'change the source code of all components using this component with the new package-name'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private renaming: RenamingMain) {}

  async report([sourceId, targetId]: [string, string], options: RenameOptions): Promise<string> {
    const results = await this.renaming.rename(sourceId, targetId, options);
    return chalk.green(
      `successfully renamed ${chalk.bold(results.sourceId.toString())} to ${chalk.bold(results.targetId.toString())}`
    );
  }
}
