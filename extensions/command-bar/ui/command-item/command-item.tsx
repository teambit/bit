import React from 'react';
import { CommandBarItem, CommandBarItemProps } from '@teambit/command-bar.command-bar-item';
import { CommanderSearchResult } from '@teambit/command-bar/command-bar.ui.runtime';
import { KeyShortcut } from '@teambit/elements.keycap';
import styles from './command-item.module.scss';

export type CommandItemProps = {
  entry: CommanderSearchResult;
} & CommandBarItemProps;

// TODO highlight match from Fuse

export function CommandItem({ entry, ...rest }: CommandItemProps) {
  const { handler, name, description, icon, iconAlt, keybinding } = entry;

  return (
    <CommandBarItem {...rest} onMouseDown={handler}>
      {/* TODO */}
      <div className={styles.main}>
        {icon && <img src={icon} alt={iconAlt} className={styles.icon} />}
        <div className={styles.name}>{name}</div>
        <KeyShortcut className={styles.commandKeys}>
          {Array.isArray(keybinding) ? keybinding[0] : keybinding}
        </KeyShortcut>
      </div>
      <div className={styles.commandDescription}>{description}</div>
    </CommandBarItem>
  );
}
