import React from 'react';
import { Keybinding } from '../../../keyboard-shortcuts/aspect/keyboard-shortcuts.ui';
import { CommandObj } from '../../../commands/aspect';
import { CommandBarItem, CommandBarItemProps } from '../command-bar-item';
import { KeySequence } from '../../../../components/keycap';
import styles from './command-item.module.scss';

export type CommandItemProps = {
  command: CommandObj;
  hotkey?: Keybinding;
} & CommandBarItemProps;

// TODO highlight match from Fuse

export function CommandItem({ command, hotkey, ...rest }: CommandItemProps) {
  return (
    <CommandBarItem {...rest}>
      <KeySequence className={styles.commandKeys}>{hotkey}</KeySequence>
      <div>{command.name}</div>
      <div className={styles.commandDescription}>{command.description}</div>
    </CommandBarItem>
  );
}
