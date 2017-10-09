/** @flow */
import serializeError from 'serialize-error';
import commander from 'commander';
import chalk from 'chalk';
import type Command from './command';
import defaultHandleError from './default-error-handler';
import { empty, first, isNumeric, buildCommandMessage, packCommand } from '../utils';
import loader from './loader';
import logger from '../logger/logger';

function logAndExit(msg: string, commandName) {
  process.stdout.write(`${msg}\n`, () => logger.exitAfterFlush(0, commandName));
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

function parseCommandName(commandName: string) {
  if (!commandName) return '';
  return first(commandName.split(' '));
}

function getOpts(c, opts: [[string, string, string]]): { [string]: boolean | string } {
  const options = {};

  opts.forEach(([, name]) => {
    name = parseCommandName(name);
    options[name] = c[name];
  });

  return options;
}

function execAction(command, concrete, args) {
  // $FlowFixMe
  const opts = getOpts(concrete, command.opts);
  const relevantArgs = args.slice(0, args.length - 1);
  logger.info(`[*] started a new command: "${command.name}" with the following data:`, { args: relevantArgs, opts });
  if (command.loader) {
    loader.on();
  }

  command
    .action(relevantArgs, opts)
    .then((data) => {
      loader.off();
      return logAndExit(command.report(data), command.name);
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

export default class CommandRegistrar {
  version: string;
  usage: string;
  description: string;
  commands: Command[];

  registerBaseCommand() {
    commander
      .version(this.version)
      .usage(this.usage)
      .option('--skip-update', 'Skips auto updates for a command')
      .description(this.description);
  }

  constructor(usage: string, description: string, version: string, commands: Command[]) {
    this.usage = usage;
    this.description = description;
    this.version = version;
    this.commands = commands;
  }

  registerCommands() {
    function createOptStr(alias, name) {
      return `-${alias}, --${name}`;
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

      command.commands.forEach((nestedCmd) => {
        register(nestedCmd, concrete);
      });

      return registerAction(command, concrete);
    }

    this.commands.forEach(cmd => register(cmd, commander));
  }

  printHelp() {
    console.log(require('./templates/help'));
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
    const aliasList = this.commands.map(cmd => first(cmd.alias.split(' ')));

    if (
      cmdList.indexOf(subcommand) === -1 &&
      aliasList.indexOf(subcommand) === -1 &&
      subcommand !== '-V' &&
      subcommand !== '--version'
    ) {
      process.stdout.write(
        chalk.yellow(
          `warning: no command named '${chalk.bold(
            subcommand
          )}' was found...\nsee 'bit --help' for additional information.\n`
        )
      );
      return this;
    }

    return this;
  }

  run() {
    const args = process.argv.slice(2);
    if (args[0] && args[0] === '--help') {
      this.printHelp();
      return this;
    }

    this.registerBaseCommand();
    this.registerCommands();
    this.outputHelp();
    commander.parse(process.argv);

    return this;
  }
}
