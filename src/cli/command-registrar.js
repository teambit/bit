/** @flow */
import type { Command } from './command';   

const commander = require('commander');

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
    function register(command: Command) {
      commander
        .command(command.name)
        .description(command.description)
        .alias(command.alias)
        .action((...args) => command.action(args));
    }
    
    this.commands.forEach(register);
  } 

  outputHelp() {
    if (!process.argv.slice(2).length) {
      commander.help();
    }

    return this;
  } 

  run() {
    this.registerBaseCommand();
    this.registerCommands();
    commander.parse(process.argv);
    this.outputHelp();

    return this;
  }
}
