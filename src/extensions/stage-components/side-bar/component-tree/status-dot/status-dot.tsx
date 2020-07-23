import React from 'react';
import classNames from 'classnames';
import styles from './status-dot.module.scss';

export type StatusDotProps = {
  status?: 'modified' | 'error' | 'new' | 'staged';
} & React.HTMLAttributes<HTMLDivElement>;

export function StatusDot({ status, className }: StatusDotProps) {
  if (!status) return null;
  return <div className={classNames(styles.statusDot, styles[status], className)}></div>;
}
