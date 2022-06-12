import { Command } from '@teambit/legacy/dist/cli/command';
import { Arguments, CommandModule, Argv } from 'yargs';
import { TOKEN_FLAG } from '@teambit/legacy/dist/constants';
import { camelCase } from 'lodash';
import { CommandRunner } from './command-runner';

export const GLOBAL_GROUP = 'Global';
export const STANDARD_GROUP = 'Options';

export class YargsAdapter implements CommandModule {
  command: string;
  describe?: string;
  aliases?: string;
  constructor(private commanderCommand: Command) {
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
    const enteredArgs = getArgsFromCommandName(this.commanderCommand.name);
    const argsValues = enteredArgs.map((a) => argv[a]) as any[];
    // a workaround to get a flag syntax such as "--all [version]" work with yargs.
    const flags = Object.keys(argv).reduce((acc, current) => {
      if (current === '_' || current === '$0' || current === '--') return acc;
      // const flagName = current.split(' ')[0];
      const val = typeof argv[current] === 'string' && !argv[current] ? true : argv[current];
      acc[current] = val;
      return acc;
    }, {});
    this.commanderCommand._packageManagerArgs = (argv['--'] || []) as string[];

    const commandRunner = new CommandRunner(this.commanderCommand, argsValues, flags);
    return commandRunner.runCommand();
  }

  get positional() {
    return this.commanderCommand.arguments;
  }

  static optionsToBuilder(command: Command) {
    const option = command.options.reduce((acc, [alias, opt, desc]) => {
      const optName = opt.split(' ')[0];
      acc[optName] = {
        alias,
        describe: desc,
        group: STANDARD_GROUP,
        type: opt.includes(' ') ? 'string' : 'boolean',
        requiresArg: opt.includes('<'),
      };
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

function getArgsFromCommandName(commandName: string) {
  const commandSplit = commandName.split(' ');
  commandSplit.shift(); // remove the first element, it's the command-name

  return commandSplit.map((existArg) => {
    const trimmed = existArg.trim();
    if ((!trimmed.startsWith('<') && !trimmed.startsWith('[')) || (!trimmed.endsWith('>') && !trimmed.endsWith(']'))) {
      throw new Error(`expect arg "${trimmed}" of "${commandName}" to be wrapped with "[]" or "<>"`);
    }
    // remove the opening and closing brackets
    const withoutBrackets = trimmed.slice(1, -1);

    return camelCase(withoutBrackets);
  });
}
