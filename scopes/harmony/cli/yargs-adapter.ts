import { Command } from './command';
import { Arguments, CommandModule, Argv, Options } from 'yargs';
import { TOKEN_FLAG } from '@teambit/legacy.constants';
import { CommandRunner } from './command-runner';
import { OnCommandStartSlot } from './cli.main.runtime';
import { getArgsData, getFlagsData } from './command-helper';

export const GLOBAL_GROUP = 'Global';
export const STANDARD_GROUP = 'Options';

export class YargsAdapter implements CommandModule {
  command: string;
  describe?: string;
  aliases?: string;
  commandRunner?: CommandRunner;
  constructor(
    private commanderCommand: Command,
    private onCommandStartSlot: OnCommandStartSlot
  ) {
    this.command = commanderCommand.name;
    this.describe = commanderCommand.description;
    this.aliases = commanderCommand.alias;
  }

  builder(yargs: Argv) {
    const options = YargsAdapter.optionsToBuilder(this.commanderCommand);
    yargs.option(options);
    this.commanderCommand.arguments?.forEach((arg) => {
      yargs.positional(arg.name, { description: arg.description });
    });
    this.commanderCommand.examples?.forEach((example) => {
      yargs.example(example.cmd, example.description);
    });

    return yargs;
  }

  handler(argv: Arguments) {
    const commandArgs = getArgsData(this.commanderCommand).map((arg) => arg.nameCamelCase);
    const argsValues = commandArgs.map((a) => argv[a]) as any[];
    // a workaround to get a flag syntax such as "--all [version]" work with yargs.
    const flags = Object.keys(argv).reduce((acc, current) => {
      if (current === '_' || current === '$0' || current === '--') return acc;
      // const flagName = current.split(' ')[0];
      const val = typeof argv[current] === 'string' && !argv[current] ? true : argv[current];
      acc[current] = val;
      return acc;
    }, {});
    this.commanderCommand._packageManagerArgs = (argv['--'] || []) as string[];

    const commandRunner = new CommandRunner(this.commanderCommand, argsValues, flags, this.onCommandStartSlot);
    this.commandRunner = commandRunner;
  }

  get positional() {
    return this.commanderCommand.arguments;
  }

  static optionsToBuilder(command: Command): { [key: string]: Options } {
    const flagsData = getFlagsData(command);
    const option = flagsData.reduce((acc, flag) => {
      acc[flag.name] = {
        alias: flag.alias,
        describe: flag.description,
        group: STANDARD_GROUP,
        type: flag.type,
        requiresArg: flag.requiresArg,
      } as Options;
      return acc;
    }, {});

    const globalOptions = YargsAdapter.getGlobalOptions(command);

    return { ...option, ...globalOptions };
  }

  static getGlobalOptions(command: Command): Record<string, any> {
    const globalOptions: Record<string, any> = {};
    if (command.remoteOp) {
      globalOptions[TOKEN_FLAG] = {
        describe: 'authentication token',
        group: GLOBAL_GROUP,
      };
    }
    globalOptions.log = {
      describe:
        'print log messages to the screen, options are: [trace, debug, info, warn, error, fatal], the default is info',
      group: GLOBAL_GROUP,
    };
    globalOptions['safe-mode'] = {
      describe:
        'useful when it fails to load normally. it skips loading aspects from workspace.jsonc, and for legacy-commands it initializes only the CLI aspect',
      group: GLOBAL_GROUP,
    };
    return globalOptions;
  }
}
