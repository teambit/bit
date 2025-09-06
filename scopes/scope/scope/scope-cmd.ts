import type { Command } from '@teambit/cli';
import chalk from 'chalk';

export class ScopeCmd implements Command {
  name = 'scope <sub-command>';
  alias = '';
  description = 'manage component scope names and assignments';
  extendedDescription = `configure scope assignments for components including setting default scopes and renaming existing scopes.
scopes determine where components are stored and published, forming the first part of component IDs.
essential for organizing components and managing component namespaces across teams.`;
  options = [];
  group = 'component-config';
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "scope", please run "bit scope --help" to list the subcommands`
    );
  }
}
