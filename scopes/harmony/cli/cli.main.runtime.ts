import { Slot, SlotRegistry } from '@teambit/harmony';
import { buildRegistry } from '@teambit/legacy/dist/cli';
import legacyLogger from '@teambit/legacy/dist/logger/logger';
import { Command } from '@teambit/legacy/dist/cli/command';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import pMapSeries from 'p-map-series';
import { groups, GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { loadConsumerIfExist } from '@teambit/legacy/dist/consumer';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { clone } from 'lodash';
import { CLIAspect, MainRuntime } from './cli.aspect';
import { getCommandId } from './get-command-id';
import { LegacyCommandAdapter } from './legacy-command-adapter';
import { CLIParser } from './cli-parser';
import { CompletionCmd } from './completion.cmd';
import { CliCmd, CliGenerateCmd } from './cli.cmd';
import { HelpCmd } from './help.cmd';

export type CommandList = Array<Command>;
export type OnStart = (hasWorkspace: boolean, currentCommand: string) => Promise<void>;
export type OnBeforeExitFn = () => Promise<void>;

export type OnStartSlot = SlotRegistry<OnStart>;
export type CommandsSlot = SlotRegistry<CommandList>;
export type OnBeforeExitSlot = SlotRegistry<OnBeforeExitFn>;

export class CLIMain {
  public groups: GroupsType = clone(groups); // if it's not cloned, it is cached across loadBit() instances
  constructor(
    private commandsSlot: CommandsSlot,
    private onStartSlot: OnStartSlot,
    private onBeforeExitSlot: OnBeforeExitSlot,
    private community: CommunityMain,
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

  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
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
    const CliParser = new CLIParser(this.commands, this.groups, this.community.getBaseDomain());
    await CliParser.parse();
  }

  private async invokeOnStart(hasWorkspace: boolean) {
    const onStartFns = this.onStartSlot.values();
    const currentCommand = process.argv[2];
    await pMapSeries(onStartFns, (onStart) => onStart(hasWorkspace, currentCommand));
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
      if (command.internal) {
        command.loader = false;
      } else {
        command.loader = true;
      }
    }
    if (command.helpUrl && !isFullUrl(command.helpUrl) && this.community) {
      command.helpUrl = `https://${this.community.getBaseDomain()}/${command.helpUrl}`;
    }
  }

  static dependencies = [CommunityAspect, LoggerAspect];
  static runtime = MainRuntime;
  static slots = [Slot.withType<CommandList>(), Slot.withType<OnStart>(), Slot.withType<OnBeforeExitFn>()];

  static async provider(
    [community, loggerMain]: [CommunityMain, LoggerMain],
    config,
    [commandsSlot, onStartSlot, onBeforeExitSlot]: [CommandsSlot, OnStartSlot, OnBeforeExitSlot]
  ) {
    const logger = loggerMain.createLogger(CLIAspect.id);
    const cliMain = new CLIMain(commandsSlot, onStartSlot, onBeforeExitSlot, community, logger);
    const legacyRegistry = buildRegistry();
    await ensureWorkspaceAndScope();
    const legacyCommands = legacyRegistry.commands;
    const legacyCommandsAdapters = legacyCommands.map((command) => new LegacyCommandAdapter(command, cliMain));
    const cliGenerateCmd = new CliGenerateCmd(cliMain);
    if (!community) {
      cliMain.register(...legacyCommandsAdapters, new CompletionCmd());
      return cliMain;
    }
    const cliCmd = new CliCmd(cliMain, community.getDocsDomain());
    const helpCmd = new HelpCmd(cliMain, community.getDocsDomain());
    cliCmd.commands.push(cliGenerateCmd);
    cliMain.register(...legacyCommandsAdapters, new CompletionCmd(), cliCmd, helpCmd);
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
    // do nothing. it could fail for example with ScopeNotFound error, which is taken care of in "bit init".
  }
}

function isFullUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://');
}
