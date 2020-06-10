import commander from 'commander';
import { splitWhen, equals } from 'ramda';
import { Command } from './command';
import CommandRegistry from './registry';
import { Reporter, ReporterExt } from '../reporter';
import { register } from '../../cli/command-registry';
import { AlreadyExistsError } from './exceptions/already-exists';
import { Help } from './commands/help.cmd';
import { LegacyCommand } from './legacy-command';
import { buildRegistry } from '../../cli';
// eslint-disable-next-line import/no-named-default
import { default as LegacyLoadExtensions } from '../../legacy-extensions/extensions-loader';

export class CLIExtension {
  readonly groups: { [k: string]: string } = {};
  static dependencies = [ReporterExt];

  static provider([reporter]: [Reporter]) {
    const paper = new CLIExtension(new CommandRegistry({}), reporter);
    return CLIProvider([paper]);
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
    command.loader = command.loader || true;
    command.commands = command.commands || [];
  }
  /**
   * registers a new command in to `Paper`.
   */
  register(command: Command) {
    this.setDefaults(command);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    command.commands!.forEach(cmd => this.setDefaults(cmd));
    this.registry.register(command);
    return this;
  }

  /**
   * list of all registered commands.
   */
  get commands() {
    return this.registry.commands;
  }

  /**
   * execute commands registered to `Paper` and the legacy bit cli.
   *
   */
  async run() {
    const args = process.argv.slice(2);
    if ((args[0] && ['-h', '--help'].includes(args[0])) || process.argv.length === 2) {
      Help()(this.commands, this.groups);
      return;
    }
    /* eslint-disable */
    Object.entries(this.commands).reduce(function(acc, [_key, paperCommand]) {
      register(paperCommand as any, acc);
      return acc;
    }, commander);

    const [params, packageManagerArgs] = splitWhen(equals('--'), process.argv);
    if (packageManagerArgs && packageManagerArgs.length) {
      // Remove the -- delimiter
      packageManagerArgs.shift();
    }
    commander.packageManagerArgs = packageManagerArgs;
    commander.parse(params);
    if (this.shouldOutputJson()) {
      this.reporter.suppressOutput();
    }
    return Promise.resolve();
  }
  private shouldOutputJson() {
    const showCommand = commander.commands.find(c => c._name === 'show');
    if (showCommand.versions) {
      return true;
    } else {
      return false;
    }
  }
  registerGroup(name: string, description: string) {
    if (this.groups[name]) {
      throw new AlreadyExistsError('group', name);
    }
    this.groups[name] = description;
  }
}

export async function CLIProvider([paper]: [CLIExtension]) {
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
  // const bitCLI = new BitCli(paper);
  const allCommands = legacyRegistry.commands.concat(legacyRegistry.extensionsCommands || []);
  allCommands.reduce((p, command) => {
    const legacyCommand = new LegacyCommand(command, p);
    p.register(legacyCommand);
    return p;
  }, paper);
  return paper;
}
