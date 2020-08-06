import React from 'react';
import { Hotkeys } from '../../../stage-components/elements/key';
import { Keybinding } from '../../../keyboard-shortcuts/keyboard-shortcuts.ui';
import { CommandObj } from '../../../commands/commands.ui';
import styles from './command-item.module.scss';
import { CommandBarItem, CommandBarItemProps } from '../command-bar-item';

export type CommandItemProps = {
  command: CommandObj;
  hotkey?: Keybinding;
} & CommandBarItemProps;

// TODO highlight match from Fuse

export function CommandItem({ command, hotkey, ...rest }: CommandItemProps) {
  return (
    <CommandBarItem {...rest}>
      <Hotkeys className={styles.commandKeys}>{hotkey}</Hotkeys>
      <div>{command.name}</div>
      <div className={styles.commandDescription}>{command.description}</div>
    </CommandBarItem>
  );
}
