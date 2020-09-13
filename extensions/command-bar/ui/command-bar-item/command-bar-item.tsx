import React from 'react';
import classnames from 'classnames';
import { CommanderSearchResult } from '@teambit/command-bar';
import { KeySequence } from '@teambit/elements.keycap';
import styles from './command-bar-item.module.scss';

export type CommandItemProps = {
  active?: boolean;
  entry: CommanderSearchResult;
} & React.HTMLAttributes<HTMLDivElement>;

export function CommandBarItem({ entry, className, active, ...rest }: CommandItemProps) {
  const { handler, displayName: name, icon, iconAlt, keybinding } = entry;
  const selectedKeybinding = Array.isArray(keybinding) ? keybinding[0] : keybinding;

  return (
    <div
      {...rest}
      className={classnames(className, styles.commandBarOption, active && styles.active)}
      onMouseDown={handler}
    >
      {icon && <img src={icon} alt={iconAlt} className={styles.icon} />}
      <div className={styles.name}>{name}</div>
      <KeySequence className={styles.commandKeys}>{selectedKeybinding}</KeySequence>
    </div>
  );
}
