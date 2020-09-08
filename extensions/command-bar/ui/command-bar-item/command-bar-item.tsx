import React from 'react';
import classNames from 'classnames';
import { roundnessClass } from '@teambit/base-ui.css-components.roundness';

import styles from './command-bar-item.module.scss';

export type CommandBarItemProps = { active?: boolean } & React.HTMLAttributes<HTMLDivElement>;

export function CommandBarItem({ className, active, ...rest }: CommandBarItemProps) {
  return (
    <div
      {...rest}
      className={classNames(className, roundnessClass.default, styles.commandBarOption, active && styles.active)}
    />
  );
}
