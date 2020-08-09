import React, { useState, useMemo, ReactElement } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';

import CommandRegistryUI from '../commands/commands.ui';
import { UIRuntimeExtension } from '../ui/ui.ui';
import { CommandBar, ChildProps } from './ui/command-bar';

export const commandBarCommands = {
  open: 'command-bar.open',
  close: 'command-bar.close',
};

export interface SearchProvider {
  /** provide completions for this search term */
  search(term: string, limit: number): ReactElement<ChildProps>[];
  /** determines what terms are handled by this searcher. */
  test(term: string): boolean;
}

type SearcherSlot = SlotRegistry<SearchProvider>;
const RESULT_LIMIT = 5;

/** Quick launch actions. Use the `addSearcher` slot to extend the available actions */
export default class CommandBarUI {
  static dependencies = [UIRuntimeExtension, CommandRegistryUI];
  static slots = [Slot.withType<SearchProvider>()];
  static async provider(
    [uiRuntimeExtension, commandRegistryUi]: [UIRuntimeExtension, CommandRegistryUI],
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

  /** Opens the command bar */
  open = () => {
    this.setVisibility?.(true);
  };

  /** Closes the command bar */
  close = () => {
    this.setVisibility?.(false);
  };

  /** Add and autocomplete provider. To support keyboard navigation, each result should have a props `active: boolean`, and `exectue: () => any` */
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
