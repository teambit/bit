import didYouMean from 'didyoumean';
import { camelCase } from 'lodash';
import yargs, { Arguments, CommandModule } from 'yargs';
import { Command } from '@teambit/legacy/dist/cli/command';
import { GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { getCommandId } from './get-command-id';
import { formatHelp } from './help';
import { GLOBAL_GROUP, YargsAdapter } from './yargs-adapter';
import { CommandRunner } from './command-runner';

export class CLIParser {
  constructor(private commands: Command[], private groups: GroupsType) {}

  async parse() {
    const args = process.argv.slice(2); // remove the first two arguments, they're not relevant
    if (!args[0] || ['-h', '--help'].includes(args[0])) {
      this.printHelp();
      return;
    }

    this.throwForNonExistsCommand(args[0]);

    yargs(args);
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

    await yargs.completion().recommendCommands().wrap(null).parse();
  }

  private printHelp() {
    const help = formatHelp(this.commands, this.groups);
    // eslint-disable-next-line no-console
    console.log(help);
  }

  private configureParser() {
    yargs.parserConfiguration({
      'strip-dashed': true,
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
    const handler = async function (argv: Arguments) {
      const enteredArgs = getArgsFromCommandName(command.name);
      const argsValues = enteredArgs.map((a) => argv[a]) as any[];
      // a workaround to get a flag syntax such as "--all [version]" work with yargs.
      const flags = Object.keys(argv).reduce((acc, current) => {
        if (current === '_' || current === '$0' || current === '--') return acc;
        const flagName = current.split(' ')[0];
        acc[flagName] = argv[current];
        return acc;
      }, {});
      command._packageManagerArgs = (argv['--'] || []) as string[];

      const commandRunner = new CommandRunner(command, argsValues, flags);
      return commandRunner.runCommand();
    };
    // @ts-ignore
    yarnCommand.handler = handler;
    // @ts-ignore
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
      // @ts-ignore
      throw new CommandNotFound(commandName, suggestion);
    }
  }
}

function getArgsFromCommandName(commandName: string) {
  const commandSplit = commandName.split(' ');
  commandSplit.shift(); // remove the first element, it's the command-name

  return commandSplit.map((existArg) => {
    const trimmed = existArg.trim();
    if ((!trimmed.startsWith('<') && !trimmed.startsWith('[')) || (!trimmed.endsWith('>') && !trimmed.endsWith(']'))) {
      throw new Error(`expect arg "${trimmed}" of "${commandName}" to be wrapped with "[]" or "<>"`);
    }
    // remove the opening and closing brackets
    const withoutBrackets = trimmed.slice(1, -1);

    return camelCase(withoutBrackets);
  });
}
