// eslint-disable-next-line max-classes-per-file
import React, { useState, useMemo, ReactElement } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';

import KeyboardShortcuts from '../keyboard-shortcuts/keyboard-shortcuts.ui';
import CommandRegistryUi from '../commands/commands.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { CommandBar, ChildProps } from './ui/command-bar';

export const commandBarCommands = {
  open: 'command-bar.open',
  close: 'command-bar.close',
};

export interface SearchProvider {
  search(term: string, limit: number): ReactElement<ChildProps>[];
  test(term: string): boolean;
}

type SearcherSlot = SlotRegistry<SearchProvider>;
const RESULT_LIMIT = 5;

export default class CommandBarUI {
  static dependencies = [UIRuntimeExtension, CommandRegistryUi];
  static slots = [Slot.withType<SearchProvider>()];
  static async provider(
    [uiRuntimeExtension, commandRegistryUi]: [UIRuntimeExtension, CommandRegistryUi],
    config,
    [searcherSlot]: [SearcherSlot]
  ) {
    const commandBar = new CommandBarUI(searcherSlot);

    commandRegistryUi.set(commandBarCommands.open, {
      handler: commandBar.open,
      name: 'open command bar',
    });
    commandRegistryUi.set(commandBarCommands.close, { handler: commandBar.close, name: 'close command bar' });
    uiRuntimeExtension.registerHudItem(<commandBar.Render key="CommandBarUI" />);

    return commandBar;
  }

  constructor(private searcherSlot: SearcherSlot) {}

  open = () => {
    this.setVisibility?.(true);
  };

  close = () => {
    this.setVisibility?.(false);
  };

  addSearcher(commandSearcher: SearchProvider) {
    this.searcherSlot.register(commandSearcher);
    return this;
  }

  // private fuseCommands = new Fuse<CommandObj>([], {
  //   includeMatches: true,
  //   // weight can be included here.
  //   // fields loses weight the longer it gets, so it seems ok for now.
  //   keys: ['key', 'name', 'description'],
  // });

  // private execute = (action: string) => {
  //   this.commandRegistryUi.run(action);
  //   this.close();
  // };

  // private searchCommands = (pattern: string, limit = 5) => {
  //   this.refreshCommands();

  //   return this.fuseCommands.search(pattern, { limit });
  // };

  // private _prevList?: CommandObj[] = undefined;
  // private refreshCommands() {
  //   const commands = this.commandRegistryUi.list();
  //   if (commands === this._prevList) return;

  //   this.fuseCommands.setCollection(commands);
  //   this._prevList = commands;
  // }

  private setVisibility?: (visible: boolean) => void;

  Render = () => {
    const [term, setTerm] = useState('');
    const [visible, setVisibility] = useState(false);
    this.setVisibility = setVisibility;

    const options = useMemo(() => {
      const searchers = this.searcherSlot.values();

      const searcher = searchers.find((x) => x.test(term));
      return searcher?.search(term, RESULT_LIMIT) || [];
    }, [term]);

    return (
      <CommandBar visible={visible} term={term} onClose={this.close} onChange={setTerm}>
        {options}
      </CommandBar>
    );
  };
}
