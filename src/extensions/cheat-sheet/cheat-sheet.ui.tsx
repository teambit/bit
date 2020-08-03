import React, { useState, useCallback, useMemo } from 'react';

import CommandRegistryUi, { CommandId } from '../commands/commands.ui';
import KeyboardShortcuts, { Keybinding } from '../keyboard-shortcuts/keyboard-shortcuts.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { CheatSheet } from './ui/cheat-sheet';

export const cheatSheetCommands = {
  open: 'cheat-sheet.open',
};

export default class CheatSheetUI {
  static dependencies = [KeyboardShortcuts, CommandRegistryUi, UIRuntimeExtension];
  static slots = [];
  static async provider(
    [keyboardShortcuts, commandRegistryUi, uiRuntimeExtension]: [
      KeyboardShortcuts,
      CommandRegistryUi,
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

  constructor(private keyboardShortcuts: KeyboardShortcuts, private commandRegistryUi: CommandRegistryUi) {}

  setOpen: React.Dispatch<React.SetStateAction<boolean>>;

  open = () => {
    this.setOpen(true);
  };

  private calcShortcuts() {
    const { keyboardShortcuts, commandRegistryUi } = this;

    return Array.from(keyboardShortcuts.entries())
      .filter(([keybinding, command]) => commandRegistryUi.has(command))
      .map(([keybinding, command]) => {
        const { name, description } = commandRegistryUi.get(command)!;

        return {
          command,
          keybinding,
          name,
          description,
        };
      });
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
