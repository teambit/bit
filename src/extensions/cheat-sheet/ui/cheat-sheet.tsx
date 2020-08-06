import React from 'react';
import classnames from 'classnames';
import { H3 } from '@teambit/documenter-temp.ui.heading';
import { PossibleSizes } from '@teambit/base-ui-temp.theme.sizes';
import { modalClass } from '../../stage-components/surfaces/modal';
import { CloseableCardProps, ClosableCard } from '../../stage-components/surfaces/closeable-card';
import { Hotkeys } from '../../stage-components/elements/key';

import styles from './cheat-sheet.module.scss';
import { Keybinding } from '../../keyboard-shortcuts/keyboard-shortcuts.ui';

export type CheatSheetProps = { shortcuts: ShortcutProps[] } & CloseableCardProps;

export function CheatSheet({ className, shortcuts, ...rest }: CheatSheetProps) {
  return (
    <ClosableCard {...rest} className={classnames(modalClass, styles.cheatSheet, className)}>
      <H3 size={PossibleSizes.sm}>Hotkeys:</H3>
      <br />

      <div className={styles.shortcut}>
        {shortcuts.map((x) => (
          <Shortcut {...x} key={x.command} />
        ))}
      </div>
    </ClosableCard>
  );
}

export type ShortcutProps = {
  command: string;
  name: string;
  keybinding: Keybinding;
  description?: string;
};

function Shortcut(props: ShortcutProps) {
  return (
    <>
      <Hotkeys>{props.keybinding}</Hotkeys>
      <span>-</span>
      <div>{props.name}</div>
      <div className={styles.description}>{props.description}</div>
    </>
  );
}
