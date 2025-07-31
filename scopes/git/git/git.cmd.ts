import type { Command } from '@teambit/cli';
import chalk from 'chalk';

const COMMAND_NAME = 'git';

export class GitCmd implements Command {
  name = `${COMMAND_NAME} <sub-command>`;
  alias = '';
  description = 'perform git operations';
  options = [];
  group = 'workspace-tools';
  commands: Command[] = [];
  // helpUrl = '';

  async report([unrecognizedSubcommand]: [string]) {
    return chalk.red(
      `"${unrecognizedSubcommand}" is not a subcommand of "git", please run "bit git --help" to list the subcommands`
    );
  }
}
