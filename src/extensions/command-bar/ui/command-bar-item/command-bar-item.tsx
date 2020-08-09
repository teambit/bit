import React from 'react';
import classNames from 'classnames';
import { roundnessClass } from '@teambit/base-ui-temp.css-components.roundness';
import { clickable } from '../../../../to-eject/css-components/clickable';

import styles from './command-bar-item.module.scss';

export type CommandBarItemProps = { execute: () => void; active?: boolean } & React.HTMLAttributes<HTMLDivElement>;

export function CommandBarItem({ className, active, execute, ...rest }: CommandBarItemProps) {
  return (
    <div
      {...rest}
      // command bar closes on blur, mousedown happens before that (click happens after that)
      onMouseDown={execute}
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
