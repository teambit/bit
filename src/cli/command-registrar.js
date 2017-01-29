/** @flow */
import commander from 'commander';
import type Command from './command';   
import defaultHandleError from './default-error-handler';
import { empty, first } from '../utils';

const chalk = require('chalk');

function logAndExit(msg: string) {
  console.log(msg); // eslint-disable-line
  process.exit();
}

function logErrAndExit(msg: string) {
  console.error(msg); // eslint-disable-line
  process.exit(1);
}

function parseSubcommandFromArgs(args: [any]) {
  if (typeof first(args) === 'string') return first(args);
  return null;
}

function parseCommandName(commandName: string) {
  if (!commandName) return '';
  return first(commandName.split(' '));
}

function getOpts(c, opts: [[string, string, string]]): {[string]: boolean|string} {
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
  command.action(args.slice(0, args.length - 1), opts)
    .then(data => logAndExit(command.report(data)))
    .catch((err) => {
      const errorHandled = defaultHandleError(err) || command.handleError(err);
      if (errorHandled) logAndExit(errorHandled);
      else logErrAndExit(err);
    });
}

// @TODO add help for subcommands
function registerAction(command: Command, concrete) {
  concrete.action((...args) => {
    if (!empty(command.commands)) {
      // $FlowFixMe
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
      
      command.commands.forEach((nestedCmd) => {
        register(nestedCmd, concrete);
      });

      return registerAction(command, concrete);
    }
    
    this.commands.forEach(cmd => register(cmd, commander));
  } 

  outputHelp() {
    const args = process.argv.slice(2);
    if (!args.length) {
      commander.help();
      return this;
    }

    const subcommand = args[0];
    const cmdList = this.commands.map(cmd => first(cmd.name.split(' ')));

    if (cmdList.indexOf(subcommand) === -1) {
      console.log(
        chalk.yellow(
          `warning: no command named '${chalk.bold(subcommand)}' was found...\nsee 'bit --help' for additional information.`)
      );
      return this;
    }

    return this;
  } 

  errorHandler(err: Error) {
    console.error(err);
  }
  
  run() {
    this.registerBaseCommand();
    this.registerCommands();
    commander.parse(process.argv);
    this.outputHelp();

    return this;
  }
}
