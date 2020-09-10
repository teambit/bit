// eslint-disable-next-line max-classes-per-file
import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import Mousetrap from 'mousetrap';

import UIAspect, { UIRuntime, UiUI } from '@teambit/ui';
import { CommandBar } from '@teambit/command-bar.command-bar';
import { CommandSearcher } from '@teambit/command-bar.command-searcher';
import { CommandBarAspect } from './command-bar.aspect';
import { commandBarCommands } from './command-bar.commands';
import { SearchProvider, Keybinding, CommandHandler, CommandId } from './types';

const RESULT_LIMIT = 5;
type SearcherSlot = SlotRegistry<SearchProvider>;

export type AddCommandArgs = {
  commandId: string;
  handler: () => any;
  keybinding?: Keybinding;
  displayName: string;
  description?: string;
};

type CommandEntry = {
  name: string;
  description?: string;
  handler: CommandHandler;
  keybinding?: Keybinding;
};

/** Quick launch actions. Use the `addSearcher` slot to extend the available actions */
export class CommandBarUI {
  private mousetrap = new Mousetrap();
  private commandRegistry = new Map<CommandId, CommandEntry>();
  private commandSearcher = new CommandSearcher([]);

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

  // TODO - make multiple
  addCommand({ commandId, handler, displayName, keybinding, description }: AddCommandArgs) {
    if (this.commandRegistry.has(commandId)) throw new Error(`command already exists: "${commandId}"`);

    this.commandRegistry.set(commandId, {
      handler,
      name: displayName,
      description,
      keybinding,
    });

    if (keybinding) {
      this.addKeybinding(keybinding, commandId);
    }

    const searchResults = Array.from(this.commandRegistry.entries()).map(([id, obj]) => ({ ...obj, id }));

    this.commandSearcher.update(searchResults);
  }

  run(command: CommandId) {
    const commandEntry = this.commandRegistry.get(command);
    if (!commandEntry) return;

    commandEntry.handler();
  }

  trigger = (key: string) => {
    this.mousetrap.trigger(key);
  };

  search = (term: string, limit: number = RESULT_LIMIT) => {
    const searchers = this.searcherSlot.values();

    const searcher = searchers.find((x) => x.test(term));
    return searcher?.search(term, limit) || [];
  };

  private addKeybinding(key: Keybinding, command: CommandId) {
    this.mousetrap.bind(key, this.run.bind(this, command));
  }

  setVisibility?: (visible: boolean) => void;

  getCommandBar = () => {
    return <CommandBar key="CommandBarUI" search={this.search} commander={this} />;
  };

  constructor(private searcherSlot: SearcherSlot) {
    this.addSearcher(this.commandSearcher);
  }

  static dependencies = [UIAspect];
  static slots = [Slot.withType<SearchProvider>()];
  static runtime = UIRuntime;
  static async provider([uiUi]: [UiUI], config, [searcherSlot]: [SearcherSlot]) {
    const commandBar = new CommandBarUI(searcherSlot);

    commandBar.addCommand({
      commandId: commandBarCommands.open,
      handler: commandBar.open,
      displayName: 'open command bar',
      keybinding: 'mod+k',
    });
    commandBar.addCommand({
      commandId: commandBarCommands.close,
      handler: commandBar.close,
      displayName: 'close command bar',
    });

    uiUi.registerHudItem(commandBar.getCommandBar());

    return commandBar;
  }
}

CommandBarAspect.addRuntime(CommandBarUI);
