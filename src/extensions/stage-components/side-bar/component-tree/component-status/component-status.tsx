import React from 'react';
import classNames from 'classnames';
import styles from './component-status.module.scss';

export type ComponentStatusProps = {
  status?: 'modified' | 'error' | 'new' | 'staged';
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentStatus({ status, className }: ComponentStatusProps) {
  if (!status) return null;
  return <div className={classNames(styles.status, styles[status], className)}>{status[0].toUpperCase()}</div>;
}
