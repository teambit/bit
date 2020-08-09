import React from 'react';
import classnames from 'classnames';
import { H3 } from '@teambit/documenter-temp.ui.heading';
import { PossibleSizes } from '@teambit/base-ui-temp.theme.sizes';
import { modalClass } from '../../stage-components/surfaces/modal';
import { CloseableCardProps, ClosableCard } from '../../stage-components/surfaces/closeable-card';

import styles from './cheat-sheet.module.scss';
import { ShortcutProps, Shortcut } from './shortcut';

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
