import commander from 'commander';
import { splitWhen, equals } from 'ramda';
import { Command } from './command';
import CommandRegistry from './registry';
// TODO: remove this import - paper should not consume cli
import { register } from '../../cli/command-registry';
import { AlreadyExistsError } from './exceptions/already-exists';
import { Help } from './commands/help.cmd';

export default class Paper {
  readonly groups: { [k: string]: string } = {};
  constructor(
    /**
     * paper's command registry
     */
    private registry: CommandRegistry
  ) {}

  private setDefaults(command: Command) {
    command.alias = command.alias || '';
    command.description = command.description || '';
    command.shortDescription = command.shortDescription || '';
    command.group = command.group || 'extensions';
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
    commander.packageManagerArgs = packageManagerArgs;
    return commander.parse(params);
  }

  registerGroup(name: string, description: string) {
    if (this.groups[name]) {
      throw new AlreadyExistsError('group', name);
    }
    this.groups[name] = description;
  }
}
