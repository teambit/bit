import React from 'react';
import classNames from 'classnames';
import { roundnessClass } from '@bit/bit.base-ui.css-components.roundness';
import { clickable } from '../../../../to-eject/css-components/clickable';

import styles from './command-bar-item.module.scss';

export type CommandBarItemProps = { execute: () => void; active?: boolean } & React.HTMLAttributes<HTMLDivElement>;

export function CommandBarItem({ className, active, ...rest }: CommandBarItemProps) {
  return (
    <div
      {...rest}
      className={classNames(
        className,
        clickable,
        roundnessClass.default,
        styles.commandBarOption,
        active && styles.active
      )}
    />
  );
}
