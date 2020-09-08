// eslint-disable-next-line max-classes-per-file
import React from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import Mousetrap from 'mousetrap';

import UIAspect, { UIRuntime, UiUI } from '@teambit/ui';
import { CommandBar } from '@teambit/command-bar.command-bar';
import { CommandId, CommandHandler } from '@teambit/commands';
import { CommandSearcher } from '@teambit/command-bar.command-searcher';
import { CommandBarAspect } from './command-bar.aspect';
import { commandBarCommands } from './command-bar.commands';

export type CommanderSearchResult = {
  id: string;
  name: string;
  description?: string;
  handler: CommandHandler;
  icon?: string;
  iconAlt?: string;
  keybinding?: Keybinding;
};

export interface SearchProvider {
  /** provide completions for this search term */
  search(term: string, limit: number): CommanderSearchResult[];
  /** determines what terms are handled by this searcher. */
  test(term: string): boolean;
}

export type Keybinding = string | string[];

type SearcherSlot = SlotRegistry<SearchProvider>;
const RESULT_LIMIT = 5;

type AddCommandArgs = {
  commandId: string;
  handler: () => any;
  keybinding?: Keybinding;
  displayName: string;
  description?: string;
};

export type CommandEntry = {
  name: string;
  description?: string;
  handler: CommandHandler;
  keybinding?: Keybinding;
};

/** Quick launch actions. Use the `addSearcher` slot to extend the available actions */
export class CommandBarUI {
  private mousetrap = new Mousetrap();
  private commandRegistry = new Map<CommandId, CommandEntry>();
  private commandSearcher = new CommandSearcher(commandsToArray(this.commandRegistry));

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

    this.commandSearcher.update(commandsToArray(this.commandRegistry));
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
    // TEMP COMMAND, DO NOT COMMIT
    commandBar.addCommand({
      commandId: 'bararara',
      handler: () => alert('bara'),
      displayName: 'bararara',
      keybinding: ['mod+y', 'alt+b alt+k'],
    });

    uiUi.registerHudItem(commandBar.getCommandBar());

    return commandBar;
  }
}

CommandBarAspect.addRuntime(CommandBarUI);

function commandsToArray(commands: Map<CommandId, CommandEntry>): CommanderSearchResult[] {
  return Array.from(commands.entries()).map(([id, obj]) => ({ ...obj, id }));
}
