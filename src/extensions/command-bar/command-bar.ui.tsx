import React, { useState } from 'react';
import Fuse from 'fuse.js';
import KeyboardShortcuts from '../keyboard-shortcuts/keyboard-shortcuts.ui';
import CommandRegistryUi, { CommandObj } from '../commands/commands.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { CommandBar } from './ui/command-bar';

export const commandBarCommands = {
  open: 'command-bar.open',
  close: 'command-bar.close',
};

export default class CommandBarUI {
  static dependencies = [UIRuntimeExtension, CommandRegistryUi, KeyboardShortcuts];
  static slots = [];
  static async provider(
    [uiRuntimeExtension, commandRegistryUi, keyboardShortcuts]: [
      UIRuntimeExtension,
      CommandRegistryUi,
      KeyboardShortcuts
    ] /* config, slots: [] */
  ) {
    const commandBar = new CommandBarUI(commandRegistryUi, keyboardShortcuts);

    commandRegistryUi.set(commandBarCommands.open, {
      handler: commandBar.open,
      name: 'open command bar',
    });
    commandRegistryUi.set(commandBarCommands.close, { handler: commandBar.close, name: 'close command bar' });

    uiRuntimeExtension.registerHudItem(<commandBar.Render key="CommandBarUI" />);

    return commandBar;
  }

  constructor(private commandRegistryUi: CommandRegistryUi, private keyboardShortcuts: KeyboardShortcuts) {}

  open = () => {
    this.setVisibility?.(true);
  };

  close = () => {
    this.setVisibility?.(false);
  };

  private fuseCommands = new Fuse<CommandObj>([], {
    includeMatches: true,
    // weight can be included here.
    // fields loses weight the longer it gets, so it seems ok for now.
    keys: ['key', 'name', 'description'],
  });

  private execute = (action: string) => {
    this.commandRegistryUi.run(action);
    this.close();
  };

  private searchCommands = (pattern: string, limit = 5) => {
    this.refreshCommands();

    return this.fuseCommands.search(pattern, { limit });
  };

  private _prevList?: CommandObj[] = undefined;
  private refreshCommands() {
    const commands = this.commandRegistryUi.list();
    if (commands === this._prevList) return;

    this.fuseCommands.setCollection(commands);
    this._prevList = commands;
  }

  private setVisibility?: (visible: boolean) => void;

  Render = () => {
    const [visible, setVisibility] = useState(false);
    this.setVisibility = setVisibility;

    return (
      <CommandBar
        visible={visible}
        onClose={this.close}
        onSubmit={this.execute}
        autoComplete={this.searchCommands}
        getHotkeys={this.keyboardShortcuts.findKeybindings}
      />
    );
  };
}
