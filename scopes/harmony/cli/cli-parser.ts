import didYouMean from 'didyoumean';
import yargs from 'yargs';
import { Command } from '@teambit/legacy/dist/cli/command';
import { GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { compact } from 'lodash';
import { loadConsumerIfExist } from '@teambit/legacy/dist/consumer';
import logger from '@teambit/legacy/dist/logger/logger';
import loader from '@teambit/legacy/dist/cli/loader';
import chalk from 'chalk';
import { getCommandId } from './get-command-id';
import { formatHelp } from './help';
import { GLOBAL_GROUP, STANDARD_GROUP, YargsAdapter } from './yargs-adapter';
import { CommandNotFound } from './exceptions/command-not-found';

export class CLIParser {
  constructor(
    private commands: Command[],
    private groups: GroupsType,
    public parser = yargs,
    private docsDomain: string
  ) {}

  async parse(args = process.argv.slice(2)) {
    this.throwForNonExistsCommand(args[0]);
    logger.debug(`[+] CLI-INPUT: ${args.join(' ')}`);
    yargs(args);
    yargs.help(false);
    this.configureParser();
    this.commands.forEach((command: Command) => {
      if (command.commands && command.commands.length) {
        this.parseCommandWithSubCommands(command);
      } else {
        const yargsCommand = this.getYargsCommand(command);
        yargs.command(yargsCommand);
      }
    });
    this.configureGlobalFlags();
    this.setHelpMiddleware();
    this.handleCommandFailure();
    this.configureCompletion();
    yargs.strict(); // don't allow non-exist flags and non-exist commands

    yargs
      // .recommendCommands() // don't use it, it brings the global help of yargs, we have a custom one
      .wrap(null);

    await yargs.parse();
  }

  private setHelpMiddleware() {
    yargs.middleware((argv) => {
      if (argv._.length === 0 && argv.help) {
        // this is the main help page
        this.printHelp();
        process.exit(0);
      }
      if (argv.help) {
        loader.off(); // stop the "loading bit..." before showing help if needed
        // this is a command help page
        yargs.showHelp(this.logCommandHelp.bind(this));
        if (!logger.isDaemon) process.exit(0);
      }
    }, true);
  }

  private handleCommandFailure() {
    yargs.fail((msg, err) => {
      loader.stop();
      if (err) {
        throw err;
      }
      yargs.showHelp(this.logCommandHelp.bind(this));
      const args = process.argv.slice(2);
      const isHelpFlagEntered = args.includes('--help') || args.includes('-h');
      const isMsgAboutMissingArgs = msg.startsWith('Not enough non-option arguments');
      // avoid showing the "Not enough non-option arguments" message when the user is trying to get the command help
      if (!isMsgAboutMissingArgs || !isHelpFlagEntered) {
        // eslint-disable-next-line no-console
        console.log(`\n${chalk.yellow(msg)}`);
      }
      if (!logger.isDaemon) process.exit(1);
    });
  }

  private configureCompletion() {
    const commandsToShowComponentIdsForCompletion = [
      'show',
      'diff',
      'tag',
      'export',
      'env',
      'envs',
      'compile',
      'build',
      'test',
      'lint',
      'log',
      'dependents',
      'dependencies',
    ];
    // @ts-ignore
    yargs.completion('completion', async function (current, argv, completionFilter, done) {
      if (!current.startsWith('-') && commandsToShowComponentIdsForCompletion.includes(argv._[1])) {
        const consumer = await loadConsumerIfExist();
        done(consumer?.bitmapIdsFromCurrentLane.map((id) => id.toStringWithoutVersion()));
      } else {
        completionFilter();
      }
    });
  }

  private printHelp() {
    const help = formatHelp(this.commands, this.groups, this.docsDomain);
    // eslint-disable-next-line no-console
    console.log(help);
  }

  private configureParser() {
    yargs.parserConfiguration({
      // 'strip-dashed': true, // we can't enable it, otherwise, the completion doesn't work
      'strip-aliased': true,
      'boolean-negation': false,
      'populate--': true,
    });
  }

  private parseCommandWithSubCommands(command: Command) {
    const yarnCommand = this.getYargsCommand(command);
    const builderFunc = () => {
      command.commands?.forEach((cmd) => {
        const subCommand = this.getYargsCommand(cmd);
        yargs.command(subCommand);
      });
      // since the "builder" method is overridden, the global flags of the main command are gone, this fixes it.
      yargs.options(YargsAdapter.getGlobalOptions(command));
      return yargs;
    };
    yarnCommand.builder = builderFunc;
    yargs.command(yarnCommand);
  }

  private getYargsCommand(command: Command): YargsAdapter {
    const yarnCommand = new YargsAdapter(command);
    yarnCommand.builder = yarnCommand.builder.bind(yarnCommand);
    yarnCommand.handler = yarnCommand.handler.bind(yarnCommand);

    return yarnCommand;
  }

  private configureGlobalFlags() {
    yargs
      .option('help', {
        alias: 'h',
        describe: 'show help',
        group: GLOBAL_GROUP,
      })
      .option('version', {
        global: false,
        alias: 'v',
        describe: 'show version',
        group: GLOBAL_GROUP,
      });
  }

  private throwForNonExistsCommand(commandName: string) {
    if (!commandName || commandName.startsWith('-')) {
      return;
    }
    const commandsNames = this.commands.map((c) => getCommandId(c.name));
    const aliases = this.commands.map((c) => c.alias).filter((a) => a);
    const existingGlobalFlags = ['-V', '--version'];
    const validCommands = [...commandsNames, ...aliases, ...existingGlobalFlags];
    const commandExist = validCommands.includes(commandName);

    if (!commandExist) {
      didYouMean.returnFirstMatch = true;
      const suggestions = didYouMean(
        commandName,
        this.commands.filter((c) => !c.private).map((c) => getCommandId(c.name))
      );
      const suggestion = suggestions && Array.isArray(suggestions) ? suggestions[0] : suggestions;

      throw new CommandNotFound(commandName, suggestion as string);
    }
  }

  /**
   * manipulate the command help output. there is no API from Yarn to do any of this, so it needs to be done manually.
   * see https://github.com/yargs/yargs/issues/1956
   *
   * the original order of the output:
   * description
   * Options
   * Commands
   * Global
   * Positionals
   * Examples
   */
  private logCommandHelp(help: string) {
    const command = this.findCommandByArgv();

    const replacer = (_, p1, p2) => `${p1}${chalk.green(p2)}`;
    const lines = help.split('\n');
    const linesWithoutEmpty = compact(lines);
    const cmdLine = linesWithoutEmpty[0];
    const description: string[] = [];
    const options: string[] = [];
    const globalOptions: string[] = [];
    const subCommands: string[] = [];
    const args: string[] = [];
    const examples: string[] = [];

    let optionsStarted = false;
    let globalStarted = false;
    let subCommandsStarted = false;
    let positionalsStarted = false;
    let examplesStarted = false;
    for (let i = 1; i < linesWithoutEmpty.length; i += 1) {
      const currentLine = linesWithoutEmpty[i];
      if (currentLine === STANDARD_GROUP) {
        optionsStarted = true;
      } else if (currentLine === GLOBAL_GROUP) {
        globalStarted = true;
      } else if (currentLine === 'Commands:') {
        subCommandsStarted = true;
      } else if (currentLine === 'Positionals:') {
        positionalsStarted = true;
      } else if (currentLine === 'Examples:') {
        examplesStarted = true;
      } else if (examplesStarted) {
        examples.push(currentLine);
      } else if (positionalsStarted) {
        args.push(currentLine);
      } else if (globalStarted) {
        globalOptions.push(currentLine);
      } else if (optionsStarted) {
        options.push(currentLine);
      } else if (subCommandsStarted) {
        subCommands.push(currentLine);
      } else {
        description.push(currentLine);
      }
    }

    // show the flags in green
    const optionsColored = options.map((opt) => opt.replace(/(--)([\w-]+)/, replacer).replace(/(-)([\w-]+)/, replacer));
    const argsColored = args.map((arg) => arg.replace(/^ {2}\S+/, (argName) => chalk.green(argName))); // regex: two spaces then the first word until a white space
    const optionsStr = options.length ? `\n${STANDARD_GROUP}\n${optionsColored.join('\n')}\n` : '';
    const argumentsStr = args.length ? `\nArguments:\n${argsColored.join('\n')}\n` : '';
    const examplesStr = examples.length ? `\nExamples:\n${examples.join('\n')}\n` : '';
    const subCommandsStr = subCommands.length ? `\n${'Commands:'}\n${subCommands.join('\n')}\n` : '';
    // show the description in bold
    const descriptionColored = description.map((desc) => chalk.bold(desc));
    if (command?.extendedDescription) {
      descriptionColored.push(command?.extendedDescription);
    }
    if (command?.helpUrl) {
      descriptionColored.push(`for more info, visit: ${chalk.underline(command.helpUrl)}`);
    }
    const descriptionStr = descriptionColored.join('\n');
    const globalOptionsStr = globalOptions.join('\n');

    const finalOutput = `${cmdLine}

${descriptionStr}
${argumentsStr}${subCommandsStr}${optionsStr}${examplesStr}
${GLOBAL_GROUP}
${globalOptionsStr}`;

    // eslint-disable-next-line no-console
    console.log(finalOutput);
  }

  private findCommandByArgv(): Command | undefined {
    const args = process.argv.slice(2);
    const enteredCommand = args[0];
    const enteredSubCommand = args[1];
    if (!enteredCommand) {
      return undefined;
    }
    const isCommandMatch = (cmd: Command, str: string) => {
      return (
        cmd.name.startsWith(`${str} `) || // e.g. "tag <id>".startsWith("tag ")
        cmd.name === str || // e.g. "globals" === "globals"
        cmd.alias === str
      ); // e.g. "t" === "t"
    };
    const command = this.commands.find((cmd) => isCommandMatch(cmd, enteredCommand));
    if (!command) {
      return undefined;
    }
    if (!command.commands || !enteredSubCommand) {
      return command; // no sub-commands.
    }
    const subCommand = command.commands.find((cmd) => isCommandMatch(cmd, enteredSubCommand));
    return subCommand || command;
  }
}
