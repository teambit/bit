import commander from 'commander';
import { splitWhen, equals } from 'ramda';
import { Command } from './command';
import CommandRegistry from './insight-registry';
import { register } from '../../cli/command-registry';
import { AlreadyExistsError } from './exceptions/already-exists';
import { Help } from './commands/help.cmd';
import Insight from './insight';

export class InsightManager {
  /**
   * insight registry
   */
  registry: CommandRegistry;
  constructor(insightList: Insight[]) {
    this.registry = new CommandRegistry(insightList);
  }

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
   * register a new insight
   */
  register(insight: Insight) {
    // this.setDefaults(insight);
    // command.commands!.forEach(cmd => this.setDefaults(cmd));
    this.registry.register(insight);
    return this;
  }

  /**
   * list of all registered commands.
   */
  get listInsights() {
    return this.registry.insights;
  }

  /**
   * execute commands registered to `Paper` and the legacy bit cli.
   *
   */
  async run(insights: Insight[]) {
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
    return Promise.resolve();
  }

  async runAll() {}
}
