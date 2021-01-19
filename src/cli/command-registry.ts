import commander from 'commander';

import { Analytics } from '../analytics/analytics';
import { SKIP_UPDATE_FLAG, TOKEN_FLAG, TOKEN_FLAG_NAME } from '../constants';
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

function parseCommandName(commandName: string): string {
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
  logger.info(`[*] started a new command: "${command.name}" with the following data:`, {
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
    .description(command.description)
    .alias(command.alias);

  if (command.remoteOp) {
    command.options.push(['', TOKEN_FLAG, 'authentication token']);
  }
  if (!command.internal) {
    command.options.push([
      '',
      'log [level]',
      'print log messages to the screen, options are: [trace, debug, info, warn, error], the default is info',
    ]);
  }

  if (packageManagerArgs) {
    command._packageManagerArgs = packageManagerArgs;
  }

  command.options.forEach(([alias, name, description]) => {
    concrete.option(createOptStr(alias, name), description);
  });

  // attach skip-update to all commands
  concrete.option(SKIP_UPDATE_FLAG, 'Skips auto updates');

  if (command.commands) {
    command.commands.forEach((nestedCmd) => {
      register(nestedCmd, concrete);
    });
  }

  return registerAction(command, concrete);
}

export default class CommandRegistry {
  version: string;
  usage: string;
  description: string;
  commands: LegacyCommand[];
  extensionsCommands: LegacyCommand[] | null | undefined;

  registerBaseCommand() {
    commander
      .version(this.version)
      .usage(this.usage)
      .option(SKIP_UPDATE_FLAG, 'Skips auto updates for a command')
      .description(this.description);
  }

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
