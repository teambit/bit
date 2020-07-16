import React from 'react';
import classNames from 'classnames';
import styles from './status.module.scss';
import colors from './status-colors.module.scss';
import { JobStatus } from '../../workspace-page/change-log.data';

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
