import { Command } from '@teambit/cli';
import chalk from 'chalk';

export class ScopeCmd implements Command {
  name = 'scope <sub-command>';
  alias = '';
  description = 'EXPERIMENTAL. manage the scope-name for components';
  options = [];
  group = 'development';
  commands: Command[] = [];

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "scope", please run "bit scope --help" to list the subcommands`
    );
  }
}
