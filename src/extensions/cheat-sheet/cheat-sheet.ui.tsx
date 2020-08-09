import React, { useState, useCallback, useMemo } from 'react';

import CommandRegistryUI from '../commands/commands.ui';
import KeyboardShortcuts from '../keyboard-shortcuts/keyboard-shortcuts.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { CheatSheet } from './ui/cheat-sheet';
import { ShortcutProps } from './ui/shortcut/shortcut';

export const cheatSheetCommands = {
  open: 'cheat-sheet.open',
};

/** overlay showing with all the available keyboard bindings from keybinding extension */
export default class CheatSheetUI {
  static dependencies = [KeyboardShortcuts, CommandRegistryUI, UIRuntimeExtension];
  static slots = [];
  static async provider(
    [keyboardShortcuts, commandRegistryUi, uiRuntimeExtension]: [
      KeyboardShortcuts,
      CommandRegistryUI,
      UIRuntimeExtension
    ] /* config, slots: [] */
  ) {
    const instance = new CheatSheetUI(keyboardShortcuts, commandRegistryUi);

    uiRuntimeExtension.registerHudItem(<instance.render key="CheatSheetUI" />);
    commandRegistryUi.set(cheatSheetCommands.open, {
      handler: instance.open,
      name: 'help',
      description: 'open this cheat sheet',
    });

    return instance;
  }

  constructor(private keyboardShortcuts: KeyboardShortcuts, private commandRegistryUi: CommandRegistryUI) {}

  private setOpen: React.Dispatch<React.SetStateAction<boolean>>;

  /** opens the cheat-sheet */
  open = (val = true) => {
    this.setOpen(val);
  };

  private calcShortcuts() {
    const { keyboardShortcuts, commandRegistryUi } = this;

    return Array.from(keyboardShortcuts.entries())
      .map(([keybinding, command]) => {
        const commandDesc = commandRegistryUi.get(command);
        if (!commandDesc) return undefined;

        const { name, description } = commandDesc;

        return {
          command,
          keybinding,
          name,
          description,
        };
      })
      .filter((x) => !!x) as ShortcutProps[]; // remove undefined type
  }

  render = () => {
    const [isOpen, setOpen] = useState(false);
    this.setOpen = setOpen;

    const handleChange = useCallback(
      (open: boolean) => {
        setOpen(open);
      },
      [setOpen]
    );

    const shortcuts = useMemo(() => (isOpen ? this.calcShortcuts() : []), [isOpen]);

    return <CheatSheet visible={isOpen} onVisibilityChange={handleChange} shortcuts={shortcuts} />;
  };
}
