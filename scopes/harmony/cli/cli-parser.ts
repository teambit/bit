import didYouMean from 'didyoumean';
import yargs, { CommandModule } from 'yargs';
import { Command } from '@teambit/legacy/dist/cli/command';
import { GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { getCommandId } from './get-command-id';
import { formatHelp } from './help';
import { YargsAdapter } from './yargs-adapter';
import { CommandRunner } from './command-runner';

export class CLIParser {
  constructor(private commands: Command[], private groups: GroupsType) {}

  async parse() {
    const args = process.argv.slice(2); // remove the first two arguments, they're not relevant
    if (!args[0] || ['-h', '--help'].includes(args[0])) {
      this.printHelp();
      return;
    }

    // TODO IMPLEMENT
    // const [params, packageManagerArgs] = splitWhen(equals('--'), process.argv);
    // if (packageManagerArgs && packageManagerArgs.length) {
    //   packageManagerArgs.shift(); // remove the -- delimiter
    // }

    // TODO IMPLEMENT SUB-COMMANDS

    this.throwForNonExistsCommand(args[0]);

    yargs(args);
    this.commands.forEach((command: Command) => {
      const yarnCommand = new YargsAdapter(command);
      this.addGlobalFlags();
      const handler = async function (argv) {
        const enteredArgs: string[] = [];
        this.demanded.forEach((requireArg) => enteredArgs.push(requireArg.cmd[0]));
        this.optional.forEach((optionalArg) => enteredArgs.push(optionalArg.cmd[0]));
        const argsValues = enteredArgs.map((a) => argv[a]);

        // console.log('yargs', yargs.demandCommand())
        // Analytics.init(concrete.name(), flags, relevantArgs);
        // logger.info(`[*] started a new command: "${parseCommandName(command.name)}" with the following data:`, {
        //   args: relevantArgs,
        //   flags,
        // });
        // if (flags[TOKEN_FLAG_NAME]) {
        //   globalFlags.token = flags[TOKEN_FLAG_NAME].toString();
        // }

        const commandRunner = new CommandRunner(command, argsValues, argv);
        return commandRunner.runCommand();
      };
      yarnCommand.handler = handler;
      yargs.command(yarnCommand);
    });
    await yargs
      .option('help', {
        alias: 'h',
        describe: 'show help',
        group: 'Global',
      })
      .option('version', {
        global: false,
        alias: 'v',
        describe: 'show version',
        group: 'Global',
      })
      .completion()
      .recommendCommands()
      .wrap(null)
      .parse();
  }

  private printHelp() {
    const help = formatHelp(this.commands, this.groups);
    // eslint-disable-next-line no-console
    console.log(help);
  }

  // TODO: IMPLEMENT
  private addGlobalFlags() {
    // const globalOptions: CommandOptions = [];
    // if (command.remoteOp) {
    //   globalOptions.push(['', TOKEN_FLAG, 'authentication token']);
    // }
    // if (!command.internal) {
    //   globalOptions.push(
    //     [
    //       '',
    //       'log [level]',
    //       'print log messages to the screen, options are: [trace, debug, info, warn, error, fatal], the default is info',
    //     ],
    //     [
    //       '',
    //       'safe-mode',
    //       'bootstrap the bare-minimum with only the CLI aspect. useful mainly for low-level commands when bit refuses to load',
    //     ]
    //   );
    // }
    // if (packageManagerArgs) {
    //   command._packageManagerArgs = packageManagerArgs;
    // }
  }

  private throwForNonExistsCommand(commandName: string) {
    const commandsNames = this.commands.map((c) => getCommandId(c.name));
    const aliases = this.commands.map((c) => c.alias).filter((a) => a);
    const globalFlags = ['-V', '--version'];
    const validCommands = [...commandsNames, ...aliases, ...globalFlags];
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
