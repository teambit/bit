import chalk from 'chalk';
import { Analytics } from '../analytics/analytics';
import { TOKEN_FLAG, TOKEN_FLAG_NAME } from '../constants';
import { Commands } from '../legacy-extensions/extension';
import logger from '../logger/logger';
import { camelCase, first } from '../utils';
import { Command } from './command';
import { CommandRunner } from './command-runner';
import globalFlags from './global-flags';
import { CommandOptions, LegacyCommand } from './legacy-command';

function parseSubcommandFromArgs(args: [any]) {
  if (typeof first(args) === 'string') return first(args);
  return null;
}

export function parseCommandName(commandName: string): string {
  if (!commandName) return '';
  return first(commandName.split(' '));
}

function getOpts(c, opts: CommandOptions): { [key: string]: boolean | string } {
  const options = {};

  opts.forEach(([, name]) => {
    const parsedName = parseCommandName(name);
    const camelCaseName = camelCase(parsedName);

    if (name.startsWith('no-')) {
      // from commander help: "Note that multi-word options starting with --no prefix negate the boolean value of the following word. For example, --no-sauce sets the value of program.sauce to false."
      // we don't want this feature, so we do the opposite action.
      options[camelCaseName] = !c[camelCase(parsedName.replace('no-', ''))];
    } else {
      options[camelCaseName] = c[camelCaseName];
    }
  });

  return options;
}

/**
 * execute the command.
 * the stack trace up to this point is confusing, it's helpful to outline it here:
 * CLIExtension.run => commander.parse(params) => commander-pkg.parse => commander-pkg.parseArgs => execAction
 */
export async function execAction(command: Command, concrete, args): Promise<any> {
  const flags = getOpts(concrete, command.options);
  const relevantArgs = args.slice(0, args.length - 1);
  Analytics.init(concrete.name(), flags, relevantArgs);
  logger.info(`[*] started a new command: "${parseCommandName(command.name)}" with the following data:`, {
    args: relevantArgs,
    flags,
  });
  if (flags[TOKEN_FLAG_NAME]) {
    globalFlags.token = flags[TOKEN_FLAG_NAME].toString();
  }
  const commandRunner = new CommandRunner(command, relevantArgs, flags);
  return commandRunner.runCommand();
}

/**
 * register the action of each one of the commands.
 * at this point, it doesn't run any `execAction`, it only register it.
 * the actual running of `execAction` happens once `commander.parse(params)` is called.
 */
function registerAction(command: Command, concrete) {
  concrete.action((...args) => {
    const subCommands = command.commands;
    if (subCommands?.length) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const subcommandName = parseSubcommandFromArgs(args);
      const subcommand = subCommands.find((cmd) => {
        return subcommandName === (parseCommandName(cmd.name) || cmd.alias);
      });

      args.shift();
      if (subcommand) return execAction(subcommand, concrete, args);
    }

    return execAction(command, concrete, args);
  });
}

function createOptStr(alias, name) {
  if (alias) {
    return `-${alias}, --${name}`;
  }
  return `--${name}`;
}

export function register(command: Command, commanderCmd, packageManagerArgs?: string[]) {
  const concrete = commanderCmd
    .command(command.name, null, { noHelp: command.private })
    .description(chalk.yellow(command.description as string))
    .alias(command.alias);

  const globalOptions: CommandOptions = [];
  if (command.remoteOp) {
    globalOptions.push(['', TOKEN_FLAG, 'authentication token']);
  }
  if (!command.internal) {
    globalOptions.push(
      [
        '',
        'log [level]',
        'print log messages to the screen, options are: [trace, debug, info, warn, error, fatal], the default is info',
      ],
      [
        '',
        'safe-mode',
        'bootstrap the bare-minimum with only the CLI aspect. useful mainly for low-level commands when bit refuses to load',
      ]
    );
  }

  if (packageManagerArgs) {
    command._packageManagerArgs = packageManagerArgs;
  }

  command.options.forEach(([alias, name, description]) => {
    concrete.option(createOptStr(alias, name), description);
  });

  styleOptions(concrete);
  addGlobalOptionsDelimiter(concrete);

  globalOptions.forEach(([alias, name, description]) => {
    concrete.option(createOptStr(alias, name), description);
    command.options.push([alias, name, description]);
  });

  if (command.commands) {
    command.commands.forEach((nestedCmd) => {
      register(nestedCmd, concrete);
    });
  }

  return registerAction(command, concrete);
}

function styleOptions(concrete) {
  concrete.options.forEach((option) => {
    option.flags = chalk.green(option.flags);
  });
}

function addGlobalOptionsDelimiter(concrete) {
  if (!concrete.options.length) return;
  const lastOption = concrete.options[concrete.options.length - 1];
  lastOption.description = `${lastOption.description}\n\nGlobal Options:`;
}

export default class CommandRegistry {
  version: string;
  usage: string;
  description: string;
  commands: LegacyCommand[];
  extensionsCommands: LegacyCommand[] | null | undefined;

  constructor(
    usage: string,
    description: string,
    version: string,
    commands: LegacyCommand[],
    extensionsCommands: Array<Commands>
  ) {
    this.usage = usage;
    this.description = description;
    this.version = version;
    this.commands = commands;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.extensionsCommands = extensionsCommands;
  }
}
