import React from 'react';
import Fuse from 'fuse.js';
import { KeyboardShortcutAspect, KeyboardShortcutsUi } from '../keyboard-shortcuts/aspect';
import { CommandBarAspect, CommandBarUI, SearchProvider } from '../command-bar/aspect';
import { CommandsAspect, CommandRegistryUI, CommandId, CommandObj } from '../commands/aspect';

import { CommandItem } from './ui/command-item';

/** Command autocomplete provider for Command bar */
export default class CommandSearchProvider implements SearchProvider {
  private fuseCommands = new Fuse<CommandObj>([], {
    // weight can be included here.
    // fields loses weight the longer it gets, so it seems ok for now.
    keys: ['key', 'name', 'description'],
  });

  /** indicates this searcher supports terms beginning with '>' */
  test(term: string): boolean {
    return term.startsWith('>');
  }

  /** finds commands similar to patterns */
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

  constructor(private commandRegistryUi: CommandRegistryUI, private keyboardShortcuts: KeyboardShortcutsUi) {}
  static dependencies = [CommandsAspect, CommandBarAspect, KeyboardShortcutAspect];
  static slots = [];
  static async provider(
    [commandRegistryUi, commandBarUI, keyboardShortcuts]: [
      CommandRegistryUI,
      CommandBarUI,
      KeyboardShortcutsUi
    ] /* config, slots: [] */
  ) {
    const commandSearcher = new CommandSearchProvider(commandRegistryUi, keyboardShortcuts);
    commandBarUI.addSearcher(commandSearcher);
    return commandSearcher;
  }
}
