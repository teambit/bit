import Mousetrap from 'mousetrap';
import CommandRegistryUi, { CommandId } from '../commands.ui/commands.ui';

// consider expanding this to be `string | string[]`
export type Keybinding = string;

type SerializedKeybinding = {
  key: Keybinding;
  command: CommandId;
};

export default class KeyboardShortcuts extends Map<Keybinding, CommandId> {
  static dependencies = [CommandRegistryUi];
  static slots = [];
  static async provider([commandRegistryUi]: [CommandRegistryUi] /* config, slots: [] */) {
    const keyboardShortcuts = new KeyboardShortcuts(commandRegistryUi);
    return keyboardShortcuts;
  }

  private mousetrap = new Mousetrap();

  constructor(private commandRegistryUi: CommandRegistryUi) {
    super();
  }

  load(keybindings: SerializedKeybinding[]) {
    keybindings.forEach(({ key, command }) => this.set(key, command));
  }
  toObj(): SerializedKeybinding[] {
    return Array.from(super.entries()).map(([key, command]) => {
      return {
        key,
        command,
      };
    });
  }

  private exec(key: Keybinding) {
    const { commandRegistryUi } = this;

    const command = this.get(key);
    if (!command) return;

    commandRegistryUi.run(command);
  }

  set = (key: Keybinding, command: CommandId) => {
    // TODO - consider supporting multiple commands per key
    if (super.has(key)) throw new Error(`duplicate keyboard keybinding "${key}"`);

    this.mousetrap.bind(key, this.exec.bind(this, key));
    return super.set(key, command);
  };

  delete = (key: Keybinding) => {
    this.mousetrap.unbind(key);
    return super.delete(key);
  };

  clear = () => {
    this.mousetrap.reset();
    return super.clear();
  };

  trigger = (key: Keybinding) => {
    this.mousetrap.trigger(key);
  };
}
