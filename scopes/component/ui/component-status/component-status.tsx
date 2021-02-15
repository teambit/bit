import classNames from 'classnames';
import React from 'react';

import styles from './component-status.module.scss';

export type ComponentStatusProps = {
  status?: StatusTypes;
} & React.HTMLAttributes<HTMLDivElement>;

export type StatusTypes = 'modified' | 'error' | 'new' | 'staged' | 'dependency' | 'updates';

export function ComponentStatus({ status, className, ...rest }: ComponentStatusProps) {
  if (!status) return null;
  return (
    <div {...rest} className={classNames(styles.status, styles[status], className)}>
      {status[0].toUpperCase()}
    </div>
  );
}
