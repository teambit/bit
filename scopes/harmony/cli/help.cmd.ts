import { Command, CommandOptions } from '@teambit/cli';
import { CLIMain } from './cli.main.runtime';
import { formatHelp } from './help';

export class HelpCmd implements Command {
  name = 'help';
  description = 'shows help';
  alias = '$0'; // default command (meaning, if no args are provided, this will be used), see https://github.com/yargs/yargs/blob/master/docs/advanced.md#default-commands
  loader = false;
  group = 'general';
  options = [['', 'internal', 'show internal commands']] as CommandOptions;

  constructor(private cliMain: CLIMain, private docsDomain: string) {}

  async report(_, { internal }: { internal: boolean }) {
    return formatHelp(this.cliMain.commands, this.cliMain.groups, this.docsDomain, internal);
  }
}
