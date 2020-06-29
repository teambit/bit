import commander from 'commander';
import { splitWhen, equals } from 'ramda';
import didYouMean from 'didyoumean';
import { Command } from '../../cli/command';
import CommandRegistry from './registry';
import { Reporter, ReporterExt } from '../reporter';
import { register } from '../../cli/command-registry';
import { AlreadyExistsError } from './exceptions/already-exists';
import { Help } from './commands/help.cmd';
import { buildRegistry } from '../../cli';
import LegacyLoadExtensions from '../../legacy-extensions/extensions-loader';
import { LegacyCommandAdapter } from './legacy-command-adapter';
import { CommandNotFound } from './exceptions/command-not-found';

export class CLIExtension {
  readonly groups: { [k: string]: string } = {};
  static dependencies = [ReporterExt];

  static provider([reporter]: [Reporter]) {
    const cli = new CLIExtension(new CommandRegistry({}), reporter);
    return CLIProvider([cli]);
  }

  constructor(
    /**
     * paper's command registry
     */
    private registry: CommandRegistry,
    private reporter: Reporter
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
  /**
   * registers a new command in to `Paper`.
   */
  register(command: Command) {
    this.setDefaults(command);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    command.commands!.forEach(cmd => this.setDefaults(cmd));
    this.registry.register(command);
  }

  /**
   * list of all registered commands. (legacy and new).
   */
  get commands() {
    return this.registry.commands;
  }

  /**
   * execute commands registered to `Paper` and the legacy bit cli.
   */
  async run() {
    const args = process.argv.slice(2); // remove the first two arguments, they're not relevant
    if (!args[0] || ['-h', '--help'].includes(args[0])) {
      Help()(this.commands, this.groups);
      return;
    }

    const [params, packageManagerArgs] = splitWhen(equals('--'), process.argv);
    if (packageManagerArgs && packageManagerArgs.length) {
      packageManagerArgs.shift(); // remove the -- delimiter
    }

    Object.values(this.commands).forEach(command => register(command as any, commander, packageManagerArgs));
    this.throwForNonExistsCommand(args[0]);

    // this is what runs the `execAction` of the specific command and eventually exits the process
    commander.parse(params);
    if (this.shouldOutputJson()) {
      this.reporter.suppressOutput();
    }
  }
  private shouldOutputJson() {
    const showCommand = commander.commands.find(c => c._name === 'show');
    return showCommand.versions;
  }
  private throwForNonExistsCommand(commandName: string) {
    const commands = Object.keys(this.commands);
    const aliases = commands.map(c => this.commands[c].alias).filter(a => a);
    const globalFlags = ['-V', '--version'];
    const validCommands = [...commands, ...aliases, ...globalFlags];
    const commandExist = validCommands.includes(commandName);

    if (!commandExist) {
      didYouMean.returnFirstMatch = true;
      const suggestions = didYouMean(
        commandName,
        Object.keys(this.commands).filter(c => !this.commands[c].private)
      );
      const suggestion = suggestions && Array.isArray(suggestions) ? suggestions[0] : suggestions;
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

export async function CLIProvider([cliExtension]: [CLIExtension]) {
  const legacyExtensions = await LegacyLoadExtensions();
  // Make sure to register all the hooks actions in the global hooks manager
  legacyExtensions.forEach(extension => {
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
  allCommands.forEach(command => {
    const legacyCommandAdapter = new LegacyCommandAdapter(command, cliExtension);
    cliExtension.register(legacyCommandAdapter);
  });
  return cliExtension;
}
