import React, { useState, useMemo, ReactElement } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';

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
