import { Slot, SlotRegistry } from '@teambit/harmony';
import { buildRegistry } from '@teambit/legacy/dist/cli';
import { Command } from '@teambit/legacy/dist/cli/command';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';

import { groups, GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { loadConsumerIfExist } from '@teambit/legacy/dist/consumer';
import { clone } from 'lodash';
import { CLIAspect, MainRuntime } from './cli.aspect';
import { AlreadyExistsError } from './exceptions/already-exists';
import { getCommandId } from './get-command-id';
import { LegacyCommandAdapter } from './legacy-command-adapter';
import { CLIParser } from './cli-parser';
import { CompletionCmd } from './completion.cmd';
import { CliCmd, CliGenerateCmd } from './cli.cmd';
import { HelpCmd } from './help.cmd';

export type CommandList = Array<Command>;
export type OnStart = (hasWorkspace: boolean) => Promise<void>;

export type OnStartSlot = SlotRegistry<OnStart>;
export type CommandsSlot = SlotRegistry<CommandList>;

export class CLIMain {
  public groups: GroupsType = clone(groups); // if it's not cloned, it is cached across loadBit() instances

  constructor(private commandsSlot: CommandsSlot, private onStartSlot: OnStartSlot, private community: CommunityMain) {}

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
      throw new AlreadyExistsError('group', name);
    }
    this.groups[name] = description;
  }

  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
    return this;
  }

  /**
   * execute commands registered to this aspect.
   */
  async run(hasWorkspace: boolean) {
    await this.invokeOnStart(hasWorkspace);
    const CliParser = new CLIParser(this.commands, this.groups, undefined, this.community.getDocsDomain());
    await CliParser.parse();
  }

  private async invokeOnStart(hasWorkspace: boolean) {
    const onStartFns = this.onStartSlot.values();
    const promises = onStartFns.map(async (onStart) => onStart(hasWorkspace));
    return Promise.all(promises);
  }

  private setDefaults(command: Command) {
    command.alias = command.alias || '';
    command.description = command.description || '';
    command.extendedDescription = command.extendedDescription || '';
    command.group = command.group || 'ungrouped';
    command.options = command.options || [];
    command.private = command.private || false;
    command.commands = command.commands || [];
    if (command.loader === undefined) {
      if (command.internal) {
        command.loader = false;
      } else {
        command.loader = true;
      }
    }
  }

  static dependencies = [CommunityAspect];
  static runtime = MainRuntime;
  static slots = [Slot.withType<CommandList>(), Slot.withType<OnStart>()];

  static async provider(
    [community]: [CommunityMain],
    config,
    [commandsSlot, onStartSlot]: [CommandsSlot, OnStartSlot]
  ) {
    const cliMain = new CLIMain(commandsSlot, onStartSlot, community);
    const legacyRegistry = buildRegistry();
    await ensureWorkspaceAndScope();
    const legacyCommands = legacyRegistry.commands;
    const legacyCommandsAdapters = legacyCommands.map((command) => new LegacyCommandAdapter(command, cliMain));
    const cliGenerateCmd = new CliGenerateCmd(cliMain);
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
