/** @flow */
import { serializeError } from 'serialize-error';
import R from 'ramda';
import commander from 'commander';
import chalk from 'chalk';
import type Command from './command';
import type { Commands } from '../extensions/extension';
import { migrate } from '../api/consumer';
import defaultHandleError from './default-error-handler';
import { empty, camelCase, first, isNumeric, buildCommandMessage, packCommand } from '../utils';
import loader from './loader';
import logger from '../logger/logger';
import { Analytics } from '../analytics/analytics';

function logAndExit(msg: string, commandName, code = 0) {
  process.stdout.write(`${msg}\n`, () => logger.exitAfterFlush(code, commandName));
}

function logErrAndExit(msg: Error | string, commandName: string) {
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

function getOpts(c, opts: [[string, string, string]]): { [string]: boolean | string } {
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

function execAction(command, concrete, args) {
  // $FlowFixMe
  const flags = getOpts(concrete, command.opts);
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
  if (flags.json) {
    loader.off();
    logger.shouldWriteToConsole = false;
  }
  const migrateWrapper = (run: boolean) => {
    if (run) {
      logger.debug('Checking if a migration is needed');
      return migrate(null, false);
    }
    return Promise.resolve();
  };

  migrateWrapper(command.migration)
    .then(() => {
      return command.action(relevantArgs, flags, packageManagerArgs).then((res) => {
        loader.off();
        let data = res;
        let code = 0;
        if (res && res.__code !== undefined) {
          data = res.data;
          code = res.__code;
        }
        return logAndExit(command.report(data, relevantArgs, flags), command.name, code);
      });
    })
    .catch((err) => {
      logger.error(
        `got an error from command ${command.name}: ${err}. Error serialized: ${JSON.stringify(
          err,
          Object.getOwnPropertyNames(err)
        )}`
      );
      loader.off();
      const errorHandled = defaultHandleError(err) || command.handleError(err);

      if (command.private) return serializeErrAndExit(err, command.name);
      if (!command.private && errorHandled) return logErrAndExit(errorHandled, command.name);
      return logErrAndExit(err, command.name);
    });
}

function serializeErrAndExit(err, commandName) {
  process.stderr.write(packCommand(buildCommandMessage(serializeError(err)), false));
  const code = err.code && isNumeric(err.code) ? err.code : 1;
  return logger.exitAfterFlush(code, commandName);
}

// @TODO add help for subcommands
function registerAction(command: Command, concrete) {
  concrete.action((...args) => {
    if (!empty(command.commands)) {
      const subcommandName = parseSubcommandFromArgs(args);
      const subcommand = command.commands.find((cmd) => {
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

function register(command: Command, commanderCmd) {
  // $FlowFixMe
  const concrete = commanderCmd
    .command(command.name, null, { noHelp: command.private })
    .description(command.description)
    .alias(command.alias);

  command.opts.forEach(([alias, name, description]) => {
    concrete.option(createOptStr(alias, name), description);
  });

  // attach skip-update to all commands
  concrete.option('--skip-update', 'Skips auto updates');

  if (command.commands) {
    command.commands.forEach((nestedCmd) => {
      register(nestedCmd, concrete);
    });
  }

  return registerAction(command, concrete);
}

export default class CommandRegistrar {
  version: string;
  usage: string;
  description: string;
  commands: Command[];
  extensionsCommands: ?(Command[]);

  registerBaseCommand() {
    commander
      .version(this.version)
      .usage(this.usage)
      .option('--skip-update', 'Skips auto updates for a command')
      .description(this.description);
  }

  constructor(
    usage: string,
    description: string,
    version: string,
    commands: Command[],
    extensionsCommands: Array<Commands>
  ) {
    this.usage = usage;
    this.description = description;
    this.version = version;
    this.commands = commands;
    this.extensionsCommands = extensionsCommands;
  }

  registerExtenstionsCommands() {
    this.extensionsCommands.forEach(cmd => register(cmd, commander));
  }

  registerCommands() {
    this.commands.forEach(cmd => register(cmd, commander));
  }

  printHelp() {
    const helpTemplateGenerator = require('./templates/help');
    console.log(helpTemplateGenerator(this.extensionsCommands));
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
    const extensionsCmdList = this.extensionsCommands.map(cmd => first(cmd.name.split(' ')));
    const aliasList = this.commands.map(cmd => first(cmd.alias.split(' ')));

    if (
      cmdList.indexOf(subcommand) === -1 &&
      extensionsCmdList.indexOf(subcommand) === -1 &&
      aliasList.indexOf(subcommand) === -1 &&
      subcommand !== '-V' &&
      subcommand !== '--version'
    ) {
      process.stdout.write(
        chalk.yellow(
          `warning: '${chalk.bold(subcommand)}' is not a valid command.\nsee 'bit --help' for additional information.\n`
        )
      );
      return this;
    }

    return this;
  }

  run() {
    const args = process.argv.slice(2);
    if (args[0] && (args[0] === '--help' || args[0] === '-h')) {
      this.printHelp();
      return this;
    }

    const [params, packageManagerArgs] = R.splitWhen(R.equals('--'), process.argv);
    packageManagerArgs.shift(); // the first item, '--', is not needed.
    this.registerBaseCommand();
    this.registerCommands();
    this.registerExtenstionsCommands();
    this.outputHelp();
    commander.packageManagerArgs = packageManagerArgs; // it's a hack, I didn't find a better way to pass them
    commander.parse(params);

    return this;
  }
}
