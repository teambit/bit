import { Command } from './command';
// eslint-disable-next-line import/named
import { AlreadyExistsError } from './exceptions';

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
      throw new AlreadyExistsError('Command', key);
    }
    this.commands[key] = command;
    return this;
  }

  /**
   * return a command unique ID.
   */
  static getID(cmd: Command): string {
    return getID(cmd.name);
  }
}

export function getID(cmd: string) {
  return cmd.split(' ')[0].trim();
}
