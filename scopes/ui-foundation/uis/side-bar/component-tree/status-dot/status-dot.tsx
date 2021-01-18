import classNames from 'classnames';
import React from 'react';

import type { StatusTypes } from '@teambit/base-ui.graph.tree.recursive-tree';
import styles from './status-dot.module.scss';

export type StatusDotProps = {
  status?: StatusTypes;
} & React.HTMLAttributes<HTMLDivElement>;

export function StatusDot({ status, className }: StatusDotProps) {
  if (!status) return null;
  return <div className={classNames(styles.statusDot, styles[status], className)}></div>;
}
