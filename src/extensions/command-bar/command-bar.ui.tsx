import React, { useState } from 'react';
import KeyboardShortcuts from '../keyboard-shortcuts/keyboard-shortcuts.ui';
import CommandRegistryUi from '../commands/commands.ui';
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
    const commandBar = new CommandBarUI();

    commandRegistryUi.set(commandBarCommands.open, { handler: commandBar.open, name: 'open command bar' });
    commandRegistryUi.set(commandBarCommands.close, { handler: commandBar.close, name: 'close command bar' });

    uiRuntimeExtension.registerHudItem(<commandBar.render key="CommandBarUI" />);

    return commandBar;
  }

  open = () => {
    this.setVisibility?.(true);
  };

  close = () => {
    this.setVisibility?.(false);
  };

  execute = (action: string) => {
    this.close();
  };

  private setVisibility?: (visible: boolean) => void;

  render = () => {
    const [visible, setVisibility] = useState(false);
    this.setVisibility = setVisibility;

    return <CommandBar visible={visible} onClose={this.close} onSubmit={this.execute} />;
  };
}
