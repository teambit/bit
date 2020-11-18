import { Slot, SlotRegistry } from '@teambit/harmony';
import { buildRegistry } from 'bit-bin/dist/cli';
import { Command } from 'bit-bin/dist/cli/command';
import { register } from 'bit-bin/dist/cli/command-registry';
import LegacyLoadExtensions from 'bit-bin/dist/legacy-extensions/extensions-loader';
import commander from 'commander';
import didYouMean from 'didyoumean';
import { equals, splitWhen } from 'ramda';

import { CLIAspect, MainRuntime } from './cli.aspect';
import { Help } from './commands/help.cmd';
import { AlreadyExistsError } from './exceptions/already-exists';
import { CommandNotFound } from './exceptions/command-not-found';
import { LegacyCommandAdapter } from './legacy-command-adapter';
import CommandRegistry from './registry';

export type OnStart = (hasWorkspace: boolean) => void;

export type OnStartSlot = SlotRegistry<OnStart>;

export class CLIMain {
  readonly groups: { [k: string]: string } = {};
  static dependencies = [];

  static provider(deps, config, [onStartSlot]: [OnStartSlot]) {
    const cli = new CLIMain(new CommandRegistry({}), onStartSlot);
    return CLIProvider([cli]);
  }

  static runtime = MainRuntime;

  static slots = [Slot.withType<OnStart>()];

  constructor(
    /**
     * paper's command registry
     */
    private registry: CommandRegistry,

    private onStartSlot: OnStartSlot
  ) {}

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
  register(command: Command) {
    this.setDefaults(command);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    command.commands!.forEach((cmd) => this.setDefaults(cmd));
    this.registry.register(command);
  }

  /**
   * helpful for having the same command name in different environments (legacy and Harmony)
   */
  unregister(commandName: string) {
    delete this.commands[commandName];
  }

  /**
   * list of all registered commands. (legacy and new).
   */
  get commands() {
    return this.registry.commands;
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

    Object.values(this.commands).forEach((command) => register(command as any, commander, packageManagerArgs));
    this.throwForNonExistsCommand(args[0]);

    // this is what runs the `execAction` of the specific command and eventually exits the process
    commander.parse(params);
  }
  private throwForNonExistsCommand(commandName: string) {
    const commands = Object.keys(this.commands);
    const aliases = commands.map((c) => this.commands[c].alias).filter((a) => a);
    const globalFlags = ['-V', '--version'];
    const validCommands = [...commands, ...aliases, ...globalFlags];
    const commandExist = validCommands.includes(commandName);

    if (!commandExist) {
      didYouMean.returnFirstMatch = true;
      const suggestions = didYouMean(
        commandName,
        Object.keys(this.commands).filter((c) => !this.commands[c].private)
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
}

export async function CLIProvider([cliExtension]: [CLIMain]) {
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
  allCommands.forEach((command) => {
    const legacyCommandAdapter = new LegacyCommandAdapter(command, cliExtension);
    cliExtension.register(legacyCommandAdapter);
  });
  return cliExtension;
}

CLIAspect.addRuntime(CLIMain);
