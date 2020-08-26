import classNames from 'classnames';
import React from 'react';

import colors from './status-colors.module.scss';
import styles from './status.module.scss';

export enum JobStatus {
  fail = 'fail',
  pass = 'pass',
  running = 'running',
  pending = 'pending',
}

type StatusProps = {
  status: JobStatus;
} & React.HTMLAttributes<HTMLSpanElement>;

export function Status({ status, className, ...rest }: StatusProps) {
  return (
    <span className={classNames(styles.status, className)} {...rest}>
      <span className={styles.text}>{status}</span>
      <div className={classNames(styles.dot, colors[status])}></div>
    </span>
  );
}
