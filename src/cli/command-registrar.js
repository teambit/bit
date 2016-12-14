/** @flow */
import commander from 'commander';
import type Command from './command';   
import defaultHandleError from './default-error-handler';


function logAndExit(msg: string) {
  console.log(msg); // eslint-disable-line
  process.exit();
}

function logErrAndExit(msg: string) {
  console.error(msg); // eslint-disable-line
  process.exit(1);
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

    function getOpts(c, opts: [[string, string, string]]): {[string]: boolean|string} {
      const options = {};

      opts.forEach(([, name]) => {
        options[name] = c[name];
      });

      return options;
    }
    
    function register(command: Command) {
      // $FlowFixMe
      const concrete = commander
        .command(command.name)
        .description(command.description)
        .alias(command.alias);

      command.opts.forEach(([alias, name, description]) => {
        concrete.option(createOptStr(alias, name), description);
      });

      concrete.action((...args) => {
        const opts = getOpts(concrete, command.opts);
        command.action(args.slice(0, args.length - 1), opts)
          .then(data => logAndExit(command.report(data)))
          .catch((err) => {
            const errorHandled = defaultHandleError(err) || command.handleError(err);
            if (errorHandled) logAndExit(errorHandled);
            else logErrAndExit(err);
          });
      });
    }
    
    this.commands.forEach(register);
  } 

  outputHelp() {
    if (!process.argv.slice(2).length) {
      commander.help();
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
