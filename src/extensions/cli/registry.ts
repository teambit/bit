import { Command } from '../../cli/command';
import { AlreadyExistsError } from './exceptions';

export default class CommandRegistry {
  constructor(readonly commands: { [commandId: string]: Command }) {}

  /**
   * register a new command
   */
  register(command: Command) {
    const id = CommandRegistry.getID(command);
    if (this.commands[id]) {
      throw new AlreadyExistsError('Command', id);
    }
    this.commands[id] = command;
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
