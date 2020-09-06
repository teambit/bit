import React, { useState, useCallback, useMemo } from 'react';

import { UIRuntime, UIAspect, UiUI } from '@teambit/ui';
import { CommandsAspect, CommandRegistryUI } from '../../commands/aspect';
import { KeyboardShortcutAspect, KeyboardShortcutsUi } from '../../keyboard-shortcuts/aspect';
import { CheatSheet } from '../ui/cheat-sheet';
import { ShortcutProps } from '../ui/shortcut/shortcut';
import { cheatSheetCommands } from './cheat-sheet.commands';

/** overlay showing with all the available keyboard bindings from keybinding extension */
export class CheatSheetUI {
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

  constructor(private keyboardShortcuts: KeyboardShortcutsUi, private commandRegistryUi: CommandRegistryUI) {}

  static dependencies = [KeyboardShortcutAspect, CommandsAspect, UIAspect];
  static slots = [];
  static runtime = UIRuntime;
  static async provider(
    [keyboardShortcuts, commandRegistryUi, uiUi]: [KeyboardShortcutsUi, CommandRegistryUI, UiUI] /* config, slots: [] */
  ) {
    const instance = new CheatSheetUI(keyboardShortcuts, commandRegistryUi);

    uiUi.registerHudItem(<instance.render key="CheatSheetUI" />);
    commandRegistryUi.set(cheatSheetCommands.open, {
      handler: instance.open,
      name: 'help',
      description: 'open this cheat sheet',
    });

    return instance;
  }
}
