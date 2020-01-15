import { Command } from './command';
import { BitCli } from '../cli';
import CommandRegistry from './registry';

export default class Paper {
  constructor(
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
   * list of all registered commands.
   */
  get commands() {
    return this.registry.commands;
  }

  /**
   * execute commands registered to `Paper` and the legacy bit cli.
   *
   */
  run() {
    // TODO: Implement this to wrap the legacy CLI (code smell)
    throw new Error('Paper.run is not implemented.');
  }
}
