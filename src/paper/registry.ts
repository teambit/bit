import { Command } from './command';
import { composeDependencyPath } from 'utils/bit/compose-component-path';

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
      throw new Error('Command already exists');
    }
    this.commands[key] = command;
    return this;
  }
  static getID(cmd: Command): string {
    return cmd.name.split(' ')[0].trim();
  }
}
const cmd: Command = {} as Command;
