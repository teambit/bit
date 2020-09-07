import React, { useState, useMemo, ReactElement } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';

import UIAspect, { UIRuntime, UiUI } from '@teambit/ui';
import { CommandBar, ChildProps } from '@teambit/command-bar.command-bar';
import { CommandRegistryUI, CommandRegistryAspect } from '@teambit/commands';
import KeyboardShortcutAspect, { KeyboardShortcutsUi } from '@teambit/keyboard-shortcuts';
import { CommandBarAspect } from './command-bar.aspect';
import { commandBarCommands } from './command-bar.commands';

export interface SearchProvider {
  /** provide completions for this search term */
  search(term: string, limit: number): ReactElement<ChildProps>[];
  /** determines what terms are handled by this searcher. */
  test(term: string): boolean;
}

type SearcherSlot = SlotRegistry<SearchProvider>;
const RESULT_LIMIT = 5;

/** Quick launch actions. Use the `addSearcher` slot to extend the available actions */
export class CommandBarUI {
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

  static dependencies = [UIAspect, CommandRegistryAspect, KeyboardShortcutAspect];
  static slots = [Slot.withType<SearchProvider>()];
  static runtime = UIRuntime;
  static async provider(
    [uiUi, commandRegistryUi, keyboardShortcutsUi]: [UiUI, CommandRegistryUI, KeyboardShortcutsUi],
    config,
    [searcherSlot]: [SearcherSlot]
  ) {
    const commandBar = new CommandBarUI(searcherSlot);

    commandRegistryUi.set(commandBarCommands.open, {
      handler: commandBar.open,
      name: 'open command bar',
    });
    commandRegistryUi.set(commandBarCommands.close, { handler: commandBar.close, name: 'close command bar' });
    keyboardShortcutsUi.set('mod+k', commandBarCommands.open);
    uiUi.registerHudItem(<commandBar.Render key="CommandBarUI" />);

    return commandBar;
  }
}

CommandBarAspect.addRuntime(CommandBarUI);
