import type { Command, CommandOptions } from './command';
import type { CLIMain } from './cli.main.runtime';
import { formatHelp } from './help';

export class HelpCmd implements Command {
  name = 'help';
  description = 'display available commands and usage information';
  extendedDescription =
    'shows a categorized list of all available Bit commands with brief descriptions. use "bit <command> --help" for detailed help on specific commands.';
  alias = '$0'; // default command (meaning, if no args are provided, this will be used), see https://github.com/yargs/yargs/blob/master/docs/advanced.md#default-commands
  loader = false;
  group = 'system';
  options = [['', 'internal', 'show internal commands']] as CommandOptions;

  constructor(private cliMain: CLIMain) {}

  async report(_, { internal }: { internal: boolean }) {
    return formatHelp(this.cliMain.commands, this.cliMain.groups, internal);
  }
}
