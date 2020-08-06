import React from 'react';
import Fuse from 'fuse.js';
import KeyboardShortcuts from '../keyboard-shortcuts/keyboard-shortcuts.ui';
import CommandRegistryUi, { CommandObj, CommandId } from '../commands/commands.ui';
import { CommandItem } from './ui/command-item';
import CommandBarUI, { SearchProvider } from './command-bar.ui';

export default class CommandSearchProvider implements SearchProvider {
  static dependencies = [CommandRegistryUi, CommandBarUI, KeyboardShortcuts];
  static slots = [];
  static async provider(
    [commandRegistryUi, commandBarUI, keyboardShortcuts]: [
      CommandRegistryUi,
      CommandBarUI,
      KeyboardShortcuts
    ] /* config, slots: [] */
  ) {
    const commandSearcher = new CommandSearchProvider(commandRegistryUi, keyboardShortcuts);
    commandBarUI.addSearcher(commandSearcher);
    return commandSearcher;
  }

  constructor(private commandRegistryUi: CommandRegistryUi, private keyboardShortcuts: KeyboardShortcuts) {}

  private fuseCommands = new Fuse<CommandObj>([], {
    // weight can be included here.
    // fields loses weight the longer it gets, so it seems ok for now.
    keys: ['key', 'name', 'description'],
  });

  test(term: string): boolean {
    return term.startsWith('>');
  }

  search = (pattern: string, limit: number) => {
    const { keyboardShortcuts } = this;
    this.refreshCommands();

    const unprefixedPattern = pattern.replace(/^>/, '');
    const searchResults = this.fuseCommands.search(unprefixedPattern, { limit });

    return searchResults.map((x) => (
      <CommandItem
        key={x.item.id}
        command={x.item}
        hotkey={keyboardShortcuts.findKeybindings(x.item.id)}
        execute={() => this.execute(x.item.id)}
      />
    ));
  };

  private execute = (commandId: CommandId) => {
    return this.commandRegistryUi.run(commandId);
  };

  private _prevList?: CommandObj[] = undefined;

  private refreshCommands() {
    const commands = this.commandRegistryUi.list();
    if (commands === this._prevList) return;
    this.fuseCommands.setCollection(commands);
    this._prevList = commands;
  }
}
