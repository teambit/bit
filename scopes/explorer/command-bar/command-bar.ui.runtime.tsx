import React, { ReactNode } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import Mousetrap from 'mousetrap';

import UIAspect, { UIRuntime, UiUI } from '@teambit/ui';
import { PubsubAspect, PubsubUI } from '@teambit/pubsub';
import { isBrowser } from '@teambit/ui-foundation.ui.is-browser';
import { CommandBar } from './ui/command-bar';
import { CommandSearcher } from './ui/command-searcher';
import { CommandBarAspect } from './command-bar.aspect';
import { commandBarCommands } from './command-bar.commands';
import { SearchProvider, Keybinding, CommandHandler, CommandId } from './types';
import { DuplicateCommandError } from './duplicate-command-error';
import { KeyEvent } from './model/key-event';
import { CommandBarContext } from './ui/command-bar-context';
import { MousetrapStub } from './mousetrap-stub';
import { openCommandBarKeybinding } from './keybinding';

const RESULT_LIMIT = 5;
type SearcherSlot = SlotRegistry<SearchProvider>;
type CommandSlot = SlotRegistry<CommandEntry[]>;

export type CommandEntry = {
  id: CommandId;
  handler: CommandHandler;
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
  addSearcher(commandSearcher: SearchProvider) {
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
      handler: x.handler,
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
      command.handler = next;
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

    return commandEntry.handler();
  }

  /**
   * executes a keyboard shortcut manually
   */
  trigger = (key: string) => {
    this.mousetrap.trigger(key);
  };

  private search = (term: string, limit: number = RESULT_LIMIT) => {
    const searchers = this.searcherSlot.values();

    const searcher = searchers.find((x) => x.test(term));
    return searcher?.search(term, limit) || [];
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

  private renderContext = ({ children }: { children: ReactNode }) => {
    return <CommandBarContext.Provider value={this}>{children}</CommandBarContext.Provider>;
  };

  /**
   * internal. Opens and closes the command bar UI.
   */
  setVisibility?: (visible: boolean) => void;

  /**
   * generate the ui for command bar
   */
  getCommandBar = () => {
    return <CommandBar key="CommandBarUI" search={this.search} commander={this} />;
  };

  constructor(private searcherSlot: SearcherSlot, private commandSlot: CommandSlot, pubSub: PubsubUI) {
    this.addSearcher(this.commandSearcher);
    pubSub.sub(CommandBarAspect.id, (e: KeyEvent) => {
      const keyboardEvent = new KeyboardEvent(e.type, e.data);
      document.dispatchEvent(keyboardEvent);
    });
  }

  static dependencies = [UIAspect, PubsubAspect];
  static slots = [Slot.withType<SearchProvider>(), Slot.withType<CommandEntry[]>()];
  static runtime = UIRuntime;
  static async provider(
    [uiUi, pubsubUI]: [UiUI, PubsubUI],
    config,
    [searcherSlot, commandSlots]: [SearcherSlot, CommandSlot]
  ) {
    const commandBar = new CommandBarUI(searcherSlot, commandSlots, pubsubUI);

    commandBar.addCommand({
      id: commandBarCommands.open,
      handler: commandBar.open,
      displayName: 'Open command bar',
      keybinding: openCommandBarKeybinding,
    });

    uiUi.registerHudItem(commandBar.getCommandBar());
    uiUi.registerRenderHooks({
      reactContext: commandBar.renderContext,
    });

    return commandBar;
  }
}

CommandBarAspect.addRuntime(CommandBarUI);
