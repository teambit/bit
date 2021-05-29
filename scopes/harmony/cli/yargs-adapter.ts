import { Command } from '@teambit/legacy/dist/cli/command';
import { CommandBuilder } from 'yargs';

export class YargsAdapter {
  command: string;
  describe?: string;
  aliases?: string;
  builder: CommandBuilder;
  constructor(private commanderCommand: Command) {
    this.command = commanderCommand.name;
    this.describe = commanderCommand.description;
    this.aliases = commanderCommand.alias;
    this.builder = this.optionsToBuilder(commanderCommand);
  }
  private optionsToBuilder(command: Command) {
    const option = command.options.reduce((acc, [alias, opt, desc]) => {
      acc[opt] = {
        alias,
        describe: desc,
        group: 'Options',
      };
      return acc;
    }, {});
    return option;
  }
}
