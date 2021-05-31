import { Command } from '@teambit/legacy/dist/cli/command';
import { CommandBuilder } from 'yargs';
import { TOKEN_FLAG } from '@teambit/legacy/dist/constants';

export const GLOBAL_GROUP = 'Global';
export const STANDARD_GROUP = 'Options';

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
        group: STANDARD_GROUP,
      };
      return acc;
    }, {});
    const globalOptions = this.getGlobalOptions(command);

    return { ...option, ...globalOptions };
  }

  private getGlobalOptions(command: Command): Record<string, any> {
    const globalOptions: Record<string, any> = {};
    if (command.remoteOp) {
      globalOptions[TOKEN_FLAG] = {
        describe: 'authentication token',
        group: GLOBAL_GROUP,
      };
    }
    if (!command.internal) {
      globalOptions.log = {
        describe:
          'print log messages to the screen, options are: [trace, debug, info, warn, error, fatal], the default is info',
        group: GLOBAL_GROUP,
      };
      globalOptions['safe-mode'] = {
        describe:
          'bootstrap the bare-minimum with only the CLI aspect. useful mainly for low-level commands when bit refuses to load',
        group: GLOBAL_GROUP,
      };
    }
    return globalOptions;
  }
}
