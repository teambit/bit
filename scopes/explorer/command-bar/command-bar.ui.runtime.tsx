import React, { useState, ComponentType } from 'react';
import flatten from 'lodash.flatten';
import Mousetrap from 'mousetrap';
import { Slot, SlotRegistry } from '@teambit/harmony';
import UIAspect, { UIRuntime, UiUI } from '@teambit/ui';
import { PubsubAspect, PubsubUI } from '@teambit/pubsub';
import { ReactRouterAspect } from '@teambit/react-router';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import { CommandBar, useSearcher, ResultsComponentProps } from '@teambit/explorer.ui.command-bar';
import { CommandBarAspect } from './command-bar.aspect';
import { commandBarCommands } from './command-bar.commands';
import { CommandSearcher, SearchProvider } from './searchers';
import { Keybinding, CommandHandler, CommandId } from './types';
import { DuplicateCommandError } from './duplicate-command-error';
import { KeyEvent } from './model/key-event';
import { MousetrapStub } from './mousetrap-stub';
import { openCommandBarKeybinding } from './keybinding';

import styles from './command-bar.module.scss';

const RESULT_LIMIT = 5;
type SearcherSlot = SlotRegistry<SearchProvider[]>;
type CommandSlot = SlotRegistry<CommandEntry[]>;

export type CommandBarConfig = {
  debounce?: number
};

export type CommandEntry = {
  id: CommandId;
  action: CommandHandler;
  keybinding?: Keybinding;
  displayName: string;
};

/** Quick launch actions. Use the `addSearcher` slot to extend the available actions */
export class CommandBarUI {
  private mousetrap = isBrowser ? new Mousetrap() : new MousetrapStub();
  private commandSearcher = new CommandSearcher([]);

  /** Opens the command bar */
  open = () => {
    this.setVisibility?.(true);
    return false; // aka prevent default
  };

  /** Closes the command bar */
  close = () => {
    this.setVisibility?.(false);
  };

  /** Add and autocomplete provider. To support keyboard navigation, each result should have a props `active: boolean`, and `exectue: () => any` */
  addSearcher(...commandSearcher: SearchProvider[]) {
    this.searcherSlot.register(commandSearcher);
    return this;
  }

  /**
   * registers a command
   */
  addCommand(...originalCommands: CommandEntry[]) {
    originalCommands.forEach(({ id: commandId }) => {
      if (this.getCommand(commandId) !== undefined) throw new DuplicateCommandError(commandId);
    });

    // commands could mutate later on, clone to ensure immutability 👌
    const commands = originalCommands.map((x) => ({
      id: x.id,
      displayName: x.displayName,
      action: x.action,
      keybinding: x.keybinding,
    }));

    this.commandSlot.register(commands);

    commands.forEach((command) => {
      if (command.keybinding) {
        this.addKeybinding(command.keybinding, command.id);
      }
    });

    this.updateCommandsSearcher();

    const updaters = commands.map((command) => (next: CommandHandler) => {
      command.action = next;
    });
    return updaters;
  }

  /**
   * executes command by name, if exists.
   * @param commandId
   */
  run(commandId: CommandId) {
    const commandEntry = this.getCommand(commandId);
    if (!commandEntry) return undefined;

    return commandEntry.action();
  }

  /**
   * executes a keyboard shortcut manually
   */
  trigger = (key: string) => {
    this.mousetrap.trigger(key);
  };

  private search = (term: string, limit: number = RESULT_LIMIT) => {
    const searchers = flatten(this.searcherSlot.values());

    const searcher = searchers.find((x) => x && x.test(term));
    return searcher?.search(term, limit) || { items: [] };
  };

  private getCommand(id: CommandId) {
    const relevantCommands = this.commandSlot
      .values()
      .map((commands) => commands.find((command) => command.id === id))
      .filter((x) => !!x);

    return relevantCommands.pop();
  }

  private updateCommandsSearcher() {
    const commands = this.commandSlot.values().flat();
    this.commandSearcher.update(commands);
  }

  private addKeybinding(key: Keybinding, command: CommandId) {
    this.mousetrap.bind(key, this.run.bind(this, command));
  }

  /**
   * Opens and closes the command bar UI.
   */
  private setVisibility?: (visible: boolean) => void;

  /**
   * generate the ui for command bar
   */
  CommandBar = ({ ResultComponent }: { ResultComponent?: ComponentType<ResultsComponentProps> }) => {
    const [visible, setVisibility] = useState(false);
    this.setVisibility = setVisibility;

    const results = useSearcher(this.search, {
      debounce: this.config.debounce
    });

    return (
      <CommandBar
        {...results}
        key="CommandBarUI"
        className={styles.commanderUi}
        placeholder="Search anything or type > to only search commands"
        visible={visible}
        ResultsComponent={ResultComponent}
        onVisibilityChange={setVisibility}
        autofocus
      />
    );
  };

  constructor(
    private searcherSlot: SearcherSlot, 
    private commandSlot: CommandSlot,
    private config: CommandBarConfig
  ) {}

  static dependencies = [UIAspect, PubsubAspect, ReactRouterAspect];
  static slots = [Slot.withType<SearchProvider>(), Slot.withType<CommandEntry[]>()];
  static defaultConfig: CommandBarConfig = {
    debounce: undefined
  };

  static runtime = UIRuntime;
  
  static async provider(
    [uiUi, pubsubUI]: [UiUI | undefined, PubsubUI | undefined],
    config: CommandBarConfig,
    [searcherSlot, commandSlots]: [SearcherSlot, CommandSlot]
  ) {
    const commandBar = new CommandBarUI(searcherSlot, commandSlots, config);

    commandBar.addSearcher(commandBar.commandSearcher);
    commandBar.addCommand({
      id: commandBarCommands.open,
      action: commandBar.open,
      displayName: 'Open command bar',
      keybinding: openCommandBarKeybinding,
    });

    if (pubsubUI) {
      pubsubUI.sub(CommandBarAspect.id, (e: KeyEvent) => {
        const keyboardEvent = new KeyboardEvent(e.type, e.data);
        document.dispatchEvent(keyboardEvent);
      });
    }

    if (uiUi) {
      uiUi.registerHudItem(<commandBar.CommandBar />);
    }

    return commandBar;
  }
}

CommandBarAspect.addRuntime(CommandBarUI);
