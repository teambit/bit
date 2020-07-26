import React from 'react';
import classNames from 'classnames';
import styles from './status-dot.module.scss';
import { StatusTypes } from '../recursive-tree';

export type StatusDotProps = {
  status?: StatusTypes;
} & React.HTMLAttributes<HTMLDivElement>;

export function StatusDot({ status, className }: StatusDotProps) {
  if (!status) return null;
  return <div className={classNames(styles.statusDot, styles[status], className)}></div>;
}
