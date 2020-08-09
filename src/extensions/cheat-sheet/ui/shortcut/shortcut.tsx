import React from 'react';
import { Hotkeys } from '../../../stage-components/elements/key';
import { Keybinding } from '../../../keyboard-shortcuts/keyboard-shortcuts.ui';
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
      <Hotkeys>{props.keybinding}</Hotkeys>
      <div>{props.name}</div>
      <div className={styles.description}>{props.description}</div>
    </>
  );
}
