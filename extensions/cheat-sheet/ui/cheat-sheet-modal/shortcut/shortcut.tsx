import React from 'react';
import { KeySequence } from '@teambit/elements.keycap';
import { Keybinding } from '@teambit/keyboard-shortcuts';
import styles from './shortcut.module.scss';

export type ShortcutProps = {
  command: string;
  name: string;
  keybinding: Keybinding;
  description?: string;
};

export function Shortcut(props: ShortcutProps) {
  return (
    <>
      <KeySequence>{props.keybinding}</KeySequence>
      <div>{props.name}</div>
      <div className={styles.description}>{props.description}</div>
    </>
  );
}
