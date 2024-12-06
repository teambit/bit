import { Slot, SlotRegistry } from '@teambit/harmony';
import legacyLogger from '@teambit/legacy/dist/logger/logger';
import { CLIArgs, Flags, Command } from '@teambit/legacy/dist/cli/command';
import pMapSeries from 'p-map-series';
import { groups, GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { HostInitializerMain } from '@teambit/host-initializer';
import { loadConsumerIfExist } from '@teambit/legacy.consumer';
import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { clone } from 'lodash';
import { CLIAspect, MainRuntime } from './cli.aspect';
import { getCommandId } from './get-command-id';
import { CLIParser, findCommandByArgv } from './cli-parser';
import { CompletionCmd } from './completion.cmd';
import { CliCmd, CliGenerateCmd } from './cli.cmd';
import { HelpCmd } from './help.cmd';
import { VersionCmd } from './version.cmd';

export type CommandList = Array<Command>;
export type OnStart = (hasWorkspace: boolean, currentCommand: string, commandObject?: Command) => Promise<void>;
export type OnCommandStart = (commandName: string, args: CLIArgs, flags: Flags) => Promise<void>;
export type OnBeforeExitFn = () => Promise<void>;

export type OnStartSlot = SlotRegistry<OnStart>;
export type OnCommandStartSlot = SlotRegistry<OnCommandStart>;
export type CommandsSlot = SlotRegistry<CommandList>;
export type OnBeforeExitSlot = SlotRegistry<OnBeforeExitFn>;

export class CLIMain {
  public groups: GroupsType = clone(groups); // if it's not cloned, it is cached across loadBit() instances
  constructor(
    private commandsSlot: CommandsSlot,
    private onStartSlot: OnStartSlot,
    readonly onCommandStartSlot: OnCommandStartSlot,
    private onBeforeExitSlot: OnBeforeExitSlot,
    private logger: Logger
  ) {}

  /**
   * registers a new command in to the CLI.
   */
  register(...commands: CommandList) {
    commands.forEach((command) => {
      this.setDefaults(command);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      command.commands!.forEach((cmd) => this.setDefaults(cmd));
    });
    this.commandsSlot.register(commands);
  }

  /**
   * helpful for having the same command name in different environments (e.g. legacy and non-legacy).
   * for example `cli.unregister('tag');` removes the "bit tag" command.
   */
  unregister(commandName: string) {
    this.commandsSlot.toArray().forEach(([aspectId, commands]) => {
      const filteredCommands = commands.filter((command) => {
        return getCommandId(command.name) !== commandName;
      });
      this.commandsSlot.map.set(aspectId, filteredCommands);
    });
  }

  /**
   * list of all registered commands. (legacy and new).
   */
  get commands(): CommandList {
    return this.commandsSlot.values().flat();
  }

  /**
   * get an instance of a registered command. (useful for aspects to modify and extend existing commands)
   */
  getCommand(name: string): Command | undefined {
    return this.commands.find((command) => getCommandId(command.name) === name);
  }

  getCommandByNameOrAlias(name: string): Command | undefined {
    const command = this.getCommand(name);
    if (command) return command;
    return this.commands.find((cmd) => cmd.alias === name);
  }

  /**
   * when running `bit help`, commands are grouped by categories.
   * this method helps registering a new group by providing its name and a description.
   * the name is what needs to be assigned to the `group` property of the Command interface.
   * the description is what shown in the `bit help` output.
   */
  registerGroup(name: string, description: string) {
    if (this.groups[name]) {
      this.logger.consoleWarning(`CLI group "${name}" is already registered`);
    } else {
      this.groups[name] = description;
    }
  }

  /**
   * onStart is when bootstrapping the CLI. (it happens before onCommandStart)
   */
  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
    return this;
  }

  /**
   * onCommandStart is when a command is about to start and we have the command object and the parsed args and flags
   * already. (it happens after onStart)
   */
  registerOnCommandStart(onCommandStartFn: OnCommandStart) {
    this.onCommandStartSlot.register(onCommandStartFn);
    return this;
  }

  /**
   * This will register a function to be called before the process exits.
   * This will run only for "regular" exits
   * e.g.
   * yes - command run and finished successfully
   * yes - command run and failed gracefully (code 1)
   * not SIGKILL (kill -9)
   * not SIGINT (Ctrl+C)
   * not SIGTERM (kill)
   * not uncaughtException
   * not unhandledRejection
   *
   * @param onBeforeExitFn
   * @returns
   */
  registerOnBeforeExit(onBeforeExitFn: OnBeforeExitFn) {
    this.onBeforeExitSlot.register(onBeforeExitFn);
    legacyLogger.registerOnBeforeExitFn(onBeforeExitFn);
    return this;
  }

  /**
   * execute commands registered to this aspect.
   */
  async run(hasWorkspace: boolean) {
    await this.invokeOnStart(hasWorkspace);
    const CliParser = new CLIParser(this.commands, this.groups, this.onCommandStartSlot);
    const commandRunner = await CliParser.parse();
    await commandRunner.runCommand();
  }

  private async invokeOnStart(hasWorkspace: boolean) {
    const onStartFns = this.onStartSlot.values();
    const foundCmd = findCommandByArgv(this.commands);
    const currentCommandName = process.argv[2];
    await pMapSeries(onStartFns, (onStart) => onStart(hasWorkspace, currentCommandName, foundCmd));
  }

  private setDefaults(command: Command) {
    command.alias = command.alias || '';
    command.description = command.description || '';
    command.extendedDescription = command.extendedDescription || '';
    command.group = command.group || 'ungrouped';
    command.options = command.options || [];
    command.private = command.private || false;
    command.commands = command.commands || [];
    command.name = command.name.trim();
    if (command.loader === undefined) {
      command.loader = true;
    }
    if (command.loadAspects === undefined) {
      command.loadAspects = true;
    }
    if (command.helpUrl && !isFullUrl(command.helpUrl)) {
      command.helpUrl = `https://bit.dev/${command.helpUrl}`;
    }
  }

  static dependencies = [LoggerAspect];
  static runtime = MainRuntime;
  static slots = [
    Slot.withType<CommandList>(),
    Slot.withType<OnStart>(),
    Slot.withType<OnCommandStart>(),
    Slot.withType<OnBeforeExitFn>(),
  ];

  static async provider(
    [loggerMain]: [LoggerMain],
    config,
    [commandsSlot, onStartSlot, onCommandStartSlot, onBeforeExitSlot]: [
      CommandsSlot,
      OnStartSlot,
      OnCommandStartSlot,
      OnBeforeExitSlot,
    ]
  ) {
    const logger = loggerMain.createLogger(CLIAspect.id);
    const cliMain = new CLIMain(commandsSlot, onStartSlot, onCommandStartSlot, onBeforeExitSlot, logger);
    await ensureWorkspaceAndScope();
    const cliGenerateCmd = new CliGenerateCmd(cliMain);
    const cliCmd = new CliCmd(cliMain);
    const helpCmd = new HelpCmd(cliMain);
    cliCmd.commands.push(cliGenerateCmd);
    cliMain.register(new CompletionCmd(), cliCmd, helpCmd, new VersionCmd());
    return cliMain;
  }
}

CLIAspect.addRuntime(CLIMain);

/**
 * kind of a hack.
 * in the legacy, this is running at the beginning and it take care of issues when Bit files are missing,
 * such as ".bit".
 * (to make this process better, you can easily remove it and run the e2e-tests. you'll see some failing)
 */
async function ensureWorkspaceAndScope() {
  try {
    await loadConsumerIfExist();
  } catch (err) {
    const potentialWsPath = process.cwd();
    const consumerInfo = await getWorkspaceInfo(potentialWsPath);
    if (consumerInfo && !consumerInfo.hasScope && consumerInfo.hasBitMap && consumerInfo.hasWorkspaceConfig) {
      await HostInitializerMain.init(potentialWsPath);
    }
    // do nothing. it could fail for example with ScopeNotFound error, which is taken care of in "bit init".
  }
}

function isFullUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://');
}
