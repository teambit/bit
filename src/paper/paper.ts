import { Command } from './command';
import { BitCli } from '../cli';
import CommandRegistry from './registry';
import LegacyCommand from './legacy-command';

export default class Paper {
  constructor(
    /**
     * instance of the legacy bit cli.
     */
    private cli: BitCli,

    /**
     * paper's command registry
     */
    private registry: CommandRegistry
  ) {}

  /**
   * registers a new command in to `Paper`.
   */
  register(command: Command) {
    this.registry.register(command);
    return this;
  }

  /**
   * execute commands registered to `Paper` and the legacy bit cli.
   */
  run() {
    const legacyCommands = this.registry.commands.map(cmd => new LegacyCommand(cmd));
    this.cli.run(legacyCommands);
  }
}
