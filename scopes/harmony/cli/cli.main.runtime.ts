import { Slot, SlotRegistry } from '@teambit/harmony';
import { buildRegistry } from '@teambit/legacy/dist/cli';
import { Command } from '@teambit/legacy/dist/cli/command';
import LegacyLoadExtensions from '@teambit/legacy/dist/legacy-extensions/extensions-loader';
import { groups, GroupsType } from '@teambit/legacy/dist/cli/command-groups';
import { clone } from 'lodash';
import { CLIAspect, MainRuntime } from './cli.aspect';
import { AlreadyExistsError } from './exceptions/already-exists';
import { getCommandId } from './get-command-id';
import { LegacyCommandAdapter } from './legacy-command-adapter';
import { CLIParser } from './cli-parser';
import { CompletionCmd } from './completion.cmd';
import { CliCmd } from './cli.cmd';

export type CommandList = Array<Command>;
export type OnStart = (hasWorkspace: boolean) => Promise<void>;

export type OnStartSlot = SlotRegistry<OnStart>;
export type CommandsSlot = SlotRegistry<CommandList>;

export class CLIMain {
  private groups: GroupsType = clone(groups); // if it's not cloned, it is cached across loadBit() instances

  constructor(private commandsSlot: CommandsSlot, private onStartSlot: OnStartSlot) {}

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
   * helpful for having the same command name in different environments (legacy and Harmony)
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
   * when running `bit --help`, commands are grouped by categories.
   * this method helps registering a new group by providing its name and a description.
   * the name is what needs to be assigned to the `group` property of the Command interface.
   * the description is what shown in the `bit --help` output.
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
    const CliParser = new CLIParser(this.commands, this.groups);
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
    command.shortDescription = command.shortDescription || '';
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

  static dependencies = [];
  static runtime = MainRuntime;
  static slots = [Slot.withType<CommandList>(), Slot.withType<OnStart>()];

  static async provider(deps, config, [commandsSlot, onStartSlot]: [CommandsSlot, OnStartSlot]) {
    const cliMain = new CLIMain(commandsSlot, onStartSlot);
    const legacyExtensions = await LegacyLoadExtensions();
    // Make sure to register all the hooks actions in the global hooks manager
    legacyExtensions.forEach((extension) => {
      extension.registerHookActionsOnHooksManager();
    });

    const extensionsCommands = legacyExtensions.reduce((acc, curr) => {
      if (curr.commands && curr.commands.length) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        acc = acc.concat(curr.commands);
      }
      return acc;
    }, []);

    const legacyRegistry = buildRegistry(extensionsCommands);
    const legacyCommands = legacyRegistry.commands.concat(legacyRegistry.extensionsCommands || []);
    const legacyCommandsAdapters = legacyCommands.map((command) => new LegacyCommandAdapter(command, cliMain));
    const cliCmd = new CliCmd(cliMain);
    cliMain.register(...legacyCommandsAdapters, new CompletionCmd(), cliCmd);

    return cliMain;
  }
}

CLIAspect.addRuntime(CLIMain);
