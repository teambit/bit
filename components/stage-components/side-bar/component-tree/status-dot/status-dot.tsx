import classNames from 'classnames';
import React from 'react';

import { StatusTypes } from '../recursive-tree';
import styles from './status-dot.module.scss';

export type StatusDotProps = {
  status?: StatusTypes;
} & React.HTMLAttributes<HTMLDivElement>;

export function StatusDot({ status, className }: StatusDotProps) {
  if (!status) return null;
  return <div className={classNames(styles.statusDot, styles[status], className)}></div>;
}
