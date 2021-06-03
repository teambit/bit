import didYouMean from 'didyoumean';
import yargs, { CommandModule } from 'yargs';
import { Command } from '@teambit/legacy/dist/cli/command';
import { GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { loadConsumerIfExist } from '@teambit/legacy/dist/consumer';
import loader from '@teambit/legacy/dist/cli/loader';
import chalk from 'chalk';
import { getCommandId } from './get-command-id';
import { formatHelp } from './help';
import { GLOBAL_GROUP, YargsAdapter } from './yargs-adapter';
import { CommandNotFound } from './exceptions/command-not-found';

export class CLIParser {
  constructor(private commands: Command[], private groups: GroupsType) {}

  async parse() {
    const args = process.argv.slice(2); // remove the first two arguments, they're not relevant

    this.throwForNonExistsCommand(args[0]);

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
    this.configureCompletion();

    yargs
      // .recommendCommands() // don't use it, it brings the global help of yargs, we have a custom one
      .wrap(null);

    await yargs.parse();
  }

  private setHelpMiddleware() {
    yargs.middleware((argv) => {
      if (argv._.length === 0) {
        // this is the main help page
        this.printHelp();
        process.exit(0);
      }
      if (argv.help) {
        loader.off(); // stop the "loading bit..." before showing help if needed
        // this is a command help page
        yargs.showHelp(logCommandHelp);
        process.exit(0);
      }
    }, true);
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
    const help = formatHelp(this.commands, this.groups);
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
    yarnCommand.builder = () => {
      command.commands?.forEach((cmd) => {
        const subCommand = this.getYargsCommand(cmd);
        yargs.command(subCommand);
      });
      return yargs;
    };
    yargs.command(yarnCommand);
  }

  private getYargsCommand(command: Command): CommandModule {
    const yarnCommand = new YargsAdapter(command);
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
}

/**
 * color the flags with green.
 * there is no API to get the options, so it is done by regex.
 * see https://github.com/yargs/yargs/issues/1956
 */
function logCommandHelp(help: string) {
  const replacer = (_, p1, p2) => `${p1}${chalk.green(p2)}`;
  const lines = help.split('\n');
  let passedOptions = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('Options')) {
      passedOptions = true;
    } else if (passedOptions) {
      lines[i] = line.replace(/(--)([\w-]+)/, replacer).replace(/(-)([\w-]+)/, replacer);
    }
  }
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}
