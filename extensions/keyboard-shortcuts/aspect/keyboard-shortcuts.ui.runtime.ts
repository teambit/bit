import Mousetrap from 'mousetrap';
import { CommandRegistryAspect, CommandId, CommandRegistryUI } from '@teambit/commands';
import { UIRuntime } from '@teambit/ui';
import { hotkeys } from './shortcuts-presets';
import { KeyboardShortcutAspect } from './keyboard-shortcuts.aspect';

// consider expanding this to be `string | string[]`
export type Keybinding = string;

export type SerializedKeybinding = {
  key: Keybinding;
  command: CommandId;
};

/** Keybindings based command triggers. Uses [Mousetrap](https://www.npmjs.com/package/mousetrap) style keybindings ('mod' = 'ctrl'/'cmd').
 * In addition to directly adding keys from other extensions, *hotkeys.ts* holds a preset for curated bindings.
 *
 * @example
 * keyboardShortcuts.set('mod+k', 'commandBar.open')
 */
export class KeyboardShortcutsUi extends Map<Keybinding, CommandId> {
  private mousetrap = new Mousetrap();

  /** bulk register keybindings from json */
  load(keybindings: SerializedKeybinding[]) {
    keybindings.forEach(({ key, command }) => {
      if (key.startsWith('-')) this.delete(key.slice(1));
      else this.set(key, command);
    });
  }
  /** serialize keybindings to json */
  toObj(): SerializedKeybinding[] {
    return Array.from(super.entries()).map(([key, command]) => {
      return {
        key,
        command,
      };
    });
  }

  private reverseMap: Map<CommandId, Set<Keybinding>> = new Map();

  private exec(key: Keybinding) {
    const { commandRegistryUi } = this;

    const command = this.get(key);
    if (!command) return;

    commandRegistryUi.run(command);
  }

  private _getReverse = (command: CommandId) => {
    let bindings = this.reverseMap.get(command);
    if (!bindings) {
      bindings = new Set();
      this.reverseMap.set(command, bindings);
    }

    return bindings;
  };

  /** registers a new keybinding to the system. (Currently does not support multiple actions per key)
   * @example
   * keyboardShortcuts.set('mod+k', 'commandBar.open')
   */
  set = (key: Keybinding, command: CommandId) => {
    if (super.has(key)) throw new Error(`duplicate keyboard keybinding "${key}"`);

    this.mousetrap.bind(key, this.exec.bind(this, key));

    this._getReverse(command).add(key);
    return super.set(key, command);
  };

  /** removes a keybinding
   * @example
   * keyboardShortcuts.set('mod+k')
   */
  delete = (key: Keybinding) => {
    this.mousetrap.unbind(key);

    const command = this.get(key);
    if (command) this._getReverse(command).delete(key);

    return super.delete(key);
  };

  /** removes all keybinding */
  clear = () => {
    this.mousetrap.reset();
    this.reverseMap.clear();
    return super.clear();
  };

  /** simulate a key event
   * @example
   * keyboardShortcuts.trigger('mod+k')
   */
  trigger = (key: Keybinding) => {
    this.mousetrap.trigger(key);
  };

  /** list all hotkeys registered with this command
   * @example
   * keyboardShortcuts.findKeybinding('commandBar.open');
   * //returns new Set(['mod+k']);
   */
  findKeybindings = (command: string) => {
    const keySet = this.reverseMap.get(command);

    // returns first value.
    const iter = keySet?.values()?.next();
    return iter?.done ? undefined : iter?.value;
  };

  constructor(private commandRegistryUi: CommandRegistryUI) {
    super();
  }

  static dependencies = [CommandRegistryAspect];
  static slots = [];
  static runtime = UIRuntime;
  static async provider([commandRegistryUi]: [CommandRegistryUI] /* config, slots: [] */) {
    const keyboardShortcuts = new KeyboardShortcutsUi(commandRegistryUi);
    keyboardShortcuts.load(hotkeys);
    return keyboardShortcuts;
  }
}

KeyboardShortcutAspect.addRuntime(KeyboardShortcutsUi);
