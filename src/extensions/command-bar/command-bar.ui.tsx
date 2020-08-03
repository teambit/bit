import React, { useState } from 'react';
import Fuse from 'fuse.js';
import KeyboardShortcuts from '../keyboard-shortcuts/keyboard-shortcuts.ui';
import CommandRegistryUi from '../commands/commands.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { CommandBar, CommandObj } from './ui/command-bar';

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

    uiRuntimeExtension.registerHudItem(<commandBar.render key="CommandBarUI" />);

    return commandBar;
  }

  constructor(private commandRegistryUi: CommandRegistryUi, private keyboardShortcuts: KeyboardShortcuts) {}

  open = () => {
    this.setVisibility?.(true);
  };

  close = () => {
    this.setVisibility?.(false);
  };

  private execute = (action: string) => {
    this.commandRegistryUi.run(action);
    this.close();
  };

  private listCommands = (pattern: string, limit: number = 5) => {
    const { commandRegistryUi, keyboardShortcuts } = this;

    // TODO - make efficient
    const commands = Array.from(commandRegistryUi.entries()).map(([id, entry]) => ({
      ...entry,
      key: keyboardShortcuts.findKeybindings(id),
      id,
    }));

    // TODO - fuse.setCollection
    const fuse = new Fuse(commands, {
      includeMatches: true,
      keys: ['key', 'name', 'description'],
    });

    return fuse.search(pattern);
  };

  private setVisibility?: (visible: boolean) => void;

  render = () => {
    const [visible, setVisibility] = useState(false);
    this.setVisibility = setVisibility;

    return (
      <CommandBar visible={visible} onClose={this.close} onSubmit={this.execute} autoComplete={this.listCommands} />
    );
  };
}
