import { Command } from './command';

export default class CommandRegistry {
  constructor(
    /**
     * array of registered commands
     */
    readonly commands: Command[]
  ) {}

  /**
   * register a new command
   */
  register(command: Command) {
    this.commands.push(command);
    return this;
  }
}
