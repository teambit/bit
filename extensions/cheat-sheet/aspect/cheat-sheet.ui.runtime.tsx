import React, { useState, useCallback, useMemo } from 'react';

import { UIRuntime, UIAspect, UiUI } from '@teambit/ui';
import { CommandRegistryAspect, CommandRegistryUI } from '@teambit/commands';
import { KeyboardShortcutAspect, KeyboardShortcutsUi } from '@teambit/keyboard-shortcuts';
import { CheatSheetModal } from '@teambit/cheat-sheet.cheat-sheet-modal';
import { ShortcutProps } from '@teambit/cheat-sheet.cheat-sheet-modal/shortcut/shortcut';
import { cheatSheetCommands } from './cheat-sheet.commands';
import { CheatSheetAspect } from './cheat-sheet.aspect';

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

    return <CheatSheetModal visible={isOpen} onVisibilityChange={handleChange} shortcuts={shortcuts} />;
  };

  constructor(private keyboardShortcuts: KeyboardShortcutsUi, private commandRegistryUi: CommandRegistryUI) {}

  static dependencies = [KeyboardShortcutAspect, CommandRegistryAspect, UIAspect];
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
    keyboardShortcuts.set('?', cheatSheetCommands.open);

    return instance;
  }
}

CheatSheetAspect.addRuntime(CheatSheetUI);
