import { serializeError } from 'serialize-error';
import commander from 'commander';
import chalk from 'chalk';
import didYouMean from 'didyoumean';
import { render } from 'ink';
import { LegacyCommand } from './command';
import { Commands } from '../legacy-extensions/extension';
import { migrate } from '../api/consumer';
import defaultHandleError from './default-error-handler';
import { camelCase, first, isNumeric, buildCommandMessage, packCommand } from '../utils';
import loader from './loader';
import logger from '../logger/logger';
import { Analytics } from '../analytics/analytics';
import { SKIP_UPDATE_FLAG, TOKEN_FLAG, TOKEN_FLAG_NAME } from '../constants';
import globalFlags from './global-flags';

didYouMean.returnFirstMatch = true;

export function logErrAndExit(msg: Error | string, commandName: string) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  if (msg.code) throw msg;
  console.error(msg); // eslint-disable-line
  logger.exitAfterFlush(1, commandName);
}

function parseSubcommandFromArgs(args: [any]) {
  if (typeof first(args) === 'string') return first(args);
  return null;
}

function parseCommandName(commandName: string): string {
  if (!commandName) return '';
  return first(commandName.split(' '));
}

function getOpts(c, opts: [[string, string, string]]): { [key: string]: boolean | string } {
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
export function execAction(command, concrete, args): Promise<any> {
  const flags = getOpts(concrete, command.options);
  const relevantArgs = args.slice(0, args.length - 1);
  const packageManagerArgs = concrete.parent.packageManagerArgs;
  Analytics.init(concrete.name(), flags, relevantArgs, concrete.parent._version);
  logger.info(`[*] started a new command: "${command.name}" with the following data:`, {
    args: relevantArgs,
    flags,
    packageManagerArgs
  });
  if (command.loader) {
    loader.on();
  }
  if (flags[TOKEN_FLAG_NAME]) {
    globalFlags.token = flags[TOKEN_FLAG_NAME].toString();
  }
  if (flags.json) {
    loader.off();
  }
  logger.shouldWriteToConsole = !flags.json;
  const migrateWrapper = (run: boolean) => {
    if (run) {
      logger.debug('Checking if a migration is needed');
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return migrate(null, false);
    }
    return Promise.resolve();
  };

  const getCommandHandler = (): 'render' | 'report' | 'json' => {
    if (flags.json) {
      if (!command.json) throw new Error(`command "${command.name}" doesn't implement "json" method`);
      return 'json';
    }
    if (command.render && command.report) {
      return process.stdout.isTTY ? 'render' : 'report';
    }
    if (command.report) return 'report';
    if (command.render) return 'render';
    throw new Error(`command "${command.name}" doesn't implement "render" nor "report" methods`);
  };
  const commandHandler = getCommandHandler();

  return (
    migrateWrapper(command.migration)
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .then(() => {
        // this is a hack in the legacy code to make paper work
        // it should be removed upon major refactoring process
        command.packageManagerArgs = packageManagerArgs;
        return command[commandHandler](relevantArgs, flags, packageManagerArgs);
      })
      .then(async res => {
        loader.off();
        switch (commandHandler) {
          case 'json': {
            const code = res.code || 0;
            const data = res.data || res;
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(data, null, 2));
            return code;
          }
          case 'render': {
            const { waitUntilExit } = render(res);
            await waitUntilExit();
            return res.props.code;
          }
          case 'report':
          default: {
            // eslint-disable-next-line no-console
            console.log(res.data);
            return res.code;
          }
        }
      })
      .then(function(code: number) {
        return logger.exitAfterFlush(code, command.name);
      })
      .catch(err => {
        logger.error(
          `got an error from command ${command.name}: ${err}. Error serialized: ${JSON.stringify(
            err,
            Object.getOwnPropertyNames(err)
          )}`
        );
        loader.off();
        const errorHandled = defaultHandleError(err) || command.handleError(err);
        if (command.private) return serializeErrAndExit(err, command.name);
        // uncomment this to see the entire error object on the console
        if (!command.private && errorHandled) return logErrAndExit(errorHandled, command.name);
        return logErrAndExit(err, command.name);
      })
  );
}

function serializeErrAndExit(err, commandName) {
  process.stderr.write(packCommand(buildCommandMessage(serializeError(err), undefined, false), false, false));
  const code = err.code && isNumeric(err.code) ? err.code : 1;
  return logger.exitAfterFlush(code, commandName);
}

/**
 * register the action of each one of the commands.
 * at this point, it doesn't run any `execAction`, it only register it.
 * the actual running of `execAction` happens once `commander.parse(params)` is called.
 */
function registerAction(command: LegacyCommand, concrete) {
  concrete.action((...args) => {
    const subCommands = command.commands;
    if (subCommands?.length) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const subcommandName = parseSubcommandFromArgs(args);
      const subcommand = subCommands.find(cmd => {
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

export function register(command: LegacyCommand, commanderCmd) {
  const concrete = commanderCmd
    .command(command.name, null, { noHelp: command.private })
    .description(command.description)
    .alias(command.alias);

  if (command.remoteOp) {
    (command.opts || (command as any).options).push(['', TOKEN_FLAG, 'authentication token']);
  }

  (command.opts || (command as any).options).forEach(([alias, name, description]) => {
    concrete.option(createOptStr(alias, name), description);
  });

  // attach skip-update to all commands
  concrete.option(SKIP_UPDATE_FLAG, 'Skips auto updates');

  if (command.commands) {
    command.commands.forEach(nestedCmd => {
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

  printHelp() {
    // eslint-disable-next-line global-require
    const helpTemplateGenerator = require('./templates/help');
    console.log(helpTemplateGenerator(this.extensionsCommands)); // eslint-disable-line no-console
    return this;
  }

  outputHelp() {
    const args = process.argv.slice(2);
    if (!args.length) {
      // @TODO replace back to commander help and override help method
      // commander.help();
      this.printHelp();
      return this;
    }

    const subcommand = args[0];
    const cmdList = this.commands.map(cmd => first(cmd.name.split(' ')));
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const extensionsCmdList = this.extensionsCommands.map(cmd => first(cmd.name.split(' ')));
    const aliasList = this.commands.map(cmd => first(cmd.alias.split(' ')));

    if (
      !cmdList.includes(subcommand) &&
      !extensionsCmdList.includes(subcommand) &&
      !aliasList.includes(subcommand) &&
      subcommand !== '-V' &&
      subcommand !== '--version'
    ) {
      process.stdout.write(
        chalk.yellow(
          `warning: '${chalk.bold(subcommand)}' is not a valid command.\nsee 'bit --help' for additional information.\n`
        )
      );
      const suggestion = didYouMean(
        subcommand,
        commander.commands.filter(c => !c._noHelp).map(cmd => cmd._name)
      );
      if (suggestion) {
        const match = typeof suggestion === 'string' ? suggestion : suggestion[0];
        console.log(chalk.red(`Did you mean ${chalk.bold(match)}?`)); // eslint-disable-line no-console
      }
      return this;
    }

    return this;
  }
}
