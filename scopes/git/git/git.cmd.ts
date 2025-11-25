import type { Command } from '@teambit/cli';
import chalk from 'chalk';

const COMMAND_NAME = 'git';

export class GitCmd implements Command {
  name = `${COMMAND_NAME} <sub-command>`;
  alias = '';
  description = 'Git utilities for Bit repositories';
  extendedDescription = `provides specialized Git utilities for handling Bit-specific files and conflicts.
includes tools for setting up merge drivers for bitmap files and resolving conflicts during Git merges.
essential for properly handling Bit's internal files when working with Git repositories.`;
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
