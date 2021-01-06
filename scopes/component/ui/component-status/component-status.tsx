import classNames from 'classnames';
import React from 'react';

import type { StatusTypes } from '@teambit/base-ui.graph.tree.recursive-tree';
import styles from './component-status.module.scss';

export type ComponentStatusProps = {
  status?: StatusTypes;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentStatus({ status, className, ...rest }: ComponentStatusProps) {
  if (!status) return null;
  return (
    <div {...rest} className={classNames(styles.status, styles[status], className)}>
      {status[0].toUpperCase()}
    </div>
  );
}
