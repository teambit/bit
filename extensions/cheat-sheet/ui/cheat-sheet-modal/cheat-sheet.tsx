import React from 'react';
import classnames from 'classnames';
import { H3 } from '@teambit/documenter.ui.heading';
import { PossibleSizes } from '@teambit/base-ui.theme.sizes';
import { modalClass } from '@teambit/surfaces.modal';
import { CloseableCardProps, ClosableCard } from '@teambit/surfaces.closeable-card';

import styles from './cheat-sheet.module.scss';
import { ShortcutProps, Shortcut } from './shortcut';

export type CheatSheetModalProps = { shortcuts: ShortcutProps[] } & CloseableCardProps;

export function CheatSheetModal({ className, shortcuts, ...rest }: CheatSheetModalProps) {
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
