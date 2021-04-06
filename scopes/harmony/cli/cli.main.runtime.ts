import { Slot, SlotRegistry } from '@teambit/harmony';
import { buildRegistry } from '@teambit/legacy/dist/cli';
import { Command } from '@teambit/legacy/dist/cli/command';
import { register } from '@teambit/legacy/dist/cli/command-registry';
import LegacyLoadExtensions from '@teambit/legacy/dist/legacy-extensions/extensions-loader';
import commander from 'commander';
import didYouMean from 'didyoumean';
import { equals, splitWhen, flatten } from 'ramda';
import loader from '@teambit/legacy/dist/cli/loader';

import { CLIAspect, MainRuntime } from './cli.aspect';
import { Help } from './commands/help.cmd';
import { AlreadyExistsError } from './exceptions/already-exists';
import { CommandNotFound } from './exceptions/command-not-found';
import { getCommandId } from './get-command-id';
import { LegacyCommandAdapter } from './legacy-command-adapter';

export type CommandList = Array<Command>;
export type OnStart = (hasWorkspace: boolean) => void;

export type OnStartSlot = SlotRegistry<OnStart>;
export type CommandsSlot = SlotRegistry<CommandList>;

export class CLIMain {
  readonly groups: { [k: string]: string } = {};

  constructor(private commandsSlot: CommandsSlot, private onStartSlot: OnStartSlot) {}

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

  registerOnStart(onStartFn: OnStart) {
    this.onStartSlot.register(onStartFn);
    return this;
  }

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
  get commands() {
    return flatten(this.commandsSlot.values());
  }

  private async invokeOnStart(hasWorkspace: boolean) {
    const onStartFns = this.onStartSlot.values();
    const promises = onStartFns.map(async (onStart) => onStart(hasWorkspace));
    return Promise.all(promises);
  }

  /**
   * execute commands registered to `Paper` and the legacy bit cli.
   */
  async run(hasWorkspace: boolean) {
    loader.start('starting bit, running cli-aspect...');
    await this.invokeOnStart(hasWorkspace);
    const args = process.argv.slice(2); // remove the first two arguments, they're not relevant
    if (!args[0] || ['-h', '--help'].includes(args[0])) {
      Help()(this.commands, this.groups);
      return;
    }

    const [params, packageManagerArgs] = splitWhen(equals('--'), process.argv);
    if (packageManagerArgs && packageManagerArgs.length) {
      packageManagerArgs.shift(); // remove the -- delimiter
    }

    this.commands.forEach((command) => register(command as any, commander, packageManagerArgs));
    this.throwForNonExistsCommand(args[0]);

    // this is what runs the `execAction` of the specific command and eventually exits the process
    commander.parse(params);
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
  registerGroup(name: string, description: string) {
    if (this.groups[name]) {
      throw new AlreadyExistsError('group', name);
    }
    this.groups[name] = description;
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
    const allCommands = legacyRegistry.commands.concat(legacyRegistry.extensionsCommands || []);
    const allCommandsAdapters = allCommands.map((command) => new LegacyCommandAdapter(command, cliMain));
    // @ts-ignore
    cliMain.register(...allCommandsAdapters);
    return cliMain;
  }
}

CLIAspect.addRuntime(CLIMain);
