import { UIRuntime } from '@teambit/ui';
import { CommandRegistryAspect } from './commands.aspect';

export type CommandHandler = (...arg: any[]) => any;
export type CommandEntry = {
  name: string;
  description?: string;
  handler: CommandHandler;
};
export type CommandId = string;
export type CommandObj = CommandEntry & { id: CommandId };

/** Meditator for commands.
 * @example
 * commandRegistryUI.set('screenshots.takeScreenshot', {
 *   name: 'Take screenshot',
 *   description: 'generate a screenshot of a composition',
 *   handler: screenshotUI.takeScreenshot,
 * });
 * // it can be then used like:
 * const optionalParams = 'ui/list';
 * commandRegistryUI.run('screenshots.takeScreenshot', optionalParameters);
 */

export class CommandRegistryUI extends Map<CommandId, CommandEntry> {
  /** executes command. Returns undefined if command is missing */
  run<R = any>(
    /** name of the command to run */
    id: CommandId,
    /** parameters to pass to command */
    ...rest: any[]
  ) {
    const command = this.get(id);
    if (!command) return undefined;

    const result = command.handler(...rest);
    return result as R;
  }

  /** unregister all commands from the registry */
  clear() {
    this._asList = undefined;
    return super.clear();
  }

  /** unregister a specific command */
  delete(commandId: CommandId) {
    this._asList = undefined;
    return super.delete(commandId);
  }

  /** adds a new command */
  set(
    /** name of the command, prefixed with the name of the extension */
    commandId: CommandId,
    /** command details and handler */
    value: CommandEntry
  ) {
    this._asList = undefined;
    return super.set(commandId, value);
  }

  /** get an array of available commands */
  list = () => {
    this._asList = this._asList || Array.from(this.entries()).map(([id, entry]) => ({ id, ...entry }));
    return this._asList;
  };

  // cached, to avoid re-creating array each time
  private _asList?: CommandObj[] = undefined;

  static dependencies = [];
  static slots = [];
  static runtime = UIRuntime;
  static async provider(/* deps: [] config, slots: [] */) {
    return new CommandRegistryUI();
  }
}

CommandRegistryAspect.addRuntime(CommandRegistryUI);
