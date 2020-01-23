import { Command } from './command';
import { CommandExistsError } from './exceptions';

export default class CommandRegistry {
  constructor(
    /**
     * array of registered commands
     */
    readonly commands: { [k: string]: Command }
  ) {}

  /**
   * register a new command
   */
  register(command: Command) {
    const key = CommandRegistry.getID(command);
    if (this.commands[key]) {
      throw new CommandExistsError();
    }
    this.commands[key] = command;
    return this;
  }

  /**
   * return a command unique ID.
   */
  static getID(cmd: Command): string {
    return cmd.name.split(' ')[0].trim();
  }
}
