import { Extension, createHook } from '../..';
import { HookRegistry, hook } from '../..';

/**
 * hook for registering new CLI commands.
 */
export const Command = createHook();

export type CommandDefinition = {
  synopsis: string,
  report: string
};

// @Extension()
export class CLI {
  /**
   * registry for the commands hook
   */
  private commands = HookRegistry.of<CommandDefinition>(Command);

  run() {
    const commands = this.commands.list();
    return commands;
  }
}
