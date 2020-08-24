import { JobStatus } from '@teambit/staged-components.workspace-sections.version-block';
import classNames from 'classnames';
import React from 'react';

import colors from './status-colors.module.scss';
import styles from './status.module.scss';

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
