import React from 'react';
import classNames from 'classnames';
import { Hotkeys } from '../../../stage-components/elements/key';
import { Keybinding } from '../../../keyboard-shortcuts/keyboard-shortcuts.ui';
import { CommandObj } from '../../../commands/commands.ui';
import styles from './command-item.module.scss';

export type CommandItemProps = {
  command: CommandObj;
  hotkey?: Keybinding;
  execute: () => void;
  active?: boolean;
};

// TODO highlight match from Fuse

export function CommandItem({ command, hotkey, active }: CommandItemProps) {
  return (
    <div className={classNames(styles.commandBarOption, active && styles.active)}>
      <Hotkeys className={styles.commandKeys}>{hotkey}</Hotkeys>
      <div>{command.name}</div>
      <div className={styles.commandDescription}>{command.description}</div>
    </div>
  );
}
