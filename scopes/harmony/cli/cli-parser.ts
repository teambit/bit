import didYouMean from 'didyoumean';
import yargs, { Arguments } from 'yargs';
import { Command } from '@teambit/legacy/dist/cli/command';
import { GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import logger from '@teambit/legacy/dist/logger/logger';
import { TOKEN_FLAG_NAME } from '@teambit/legacy/dist/constants';
import globalFlags from '@teambit/legacy/dist/cli/global-flags';
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
        this.parseCommand(command);
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
    const yarnCommand = new YargsAdapter(command);
    yarnCommand.builder = (yargInstance) => {
      command.commands?.forEach((cmd) => {
        this.parseCommand(cmd);
      });
      return yargInstance;
    };
    // @ts-ignore
    yargs.command(yarnCommand).demand(1);
  }

  private parseCommand(command: Command) {
    const yarnCommand = new YargsAdapter(command);
    const handler = async function (argv: Arguments) {
      const enteredArgs: string[] = [];
      // @ts-ignore
      this.demanded.forEach((requireArg) => enteredArgs.push(requireArg.cmd[0]));
      // @ts-ignore
      this.optional.forEach((optionalArg) => enteredArgs.push(optionalArg.cmd[0]));
      const argsValues = enteredArgs.map((a) => argv[a]) as any[];
      // a workaround to get a flag syntax such as "--all [version]" work with yargs.
      const flags = Object.keys(argv).reduce((acc, current) => {
        if (current === '_' || current === '$0' || current === '--') return acc;
        const flagName = current.split(' ')[0];
        acc[flagName] = argv[current];
        return acc;
      }, {});
      command._packageManagerArgs = (argv['--'] || []) as string[];
      const commandName = argv._[0] as string;

      Analytics.init(commandName, flags, argsValues);
      logger.info(`[*] started a new command: "${commandName}" with the following data:`, {
        args: argsValues,
        flags,
      });
      if (flags[TOKEN_FLAG_NAME]) {
        globalFlags.token = flags[TOKEN_FLAG_NAME].toString();
      }

      const commandRunner = new CommandRunner(command, argsValues, flags);
      return commandRunner.runCommand();
    };
    // @ts-ignore
    yarnCommand.handler = handler;
    // @ts-ignore
    yargs.command(yarnCommand);
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
