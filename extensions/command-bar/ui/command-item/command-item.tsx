import React from 'react';
import { CommandBarItem, CommandBarItemProps } from '@teambit/command-bar.command-bar-item';
// import { Keybinding } from '@teambit/keyboard-shortcuts';
// import { KeySequence } from '@teambit/elements.keycap';
import { CommanderSearchResult } from '@teambit/command-bar/command-bar.ui.runtime';
import styles from './command-item.module.scss';

export type CommandItemProps = {
  entry: CommanderSearchResult;
  // hotkey?: Keybinding;
} & CommandBarItemProps;

// TODO highlight match from Fuse

export function CommandItem({ entry, ...rest }: CommandItemProps) {
  const { handler, name, description } = entry;

  return (
    <CommandBarItem {...rest} onMouseDown={handler}>
      {/* TODO */}
      {/* <KeySequence className={styles.commandKeys}>{hotkey}</KeySequence> */}
      <div>{name}</div>
      <div className={styles.commandDescription}>{description}</div>
    </CommandBarItem>
  );
}
