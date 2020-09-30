import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import humanizeDuration from 'humanize-duration';
import styles from './test-table.module.scss';

export function getStatusIcon(status?: string) {
  if (status === 'passed') {
    return <Icon className={styles.pass} of={'billing-checkmark'} />;
  }

  if (status === 'failed') {
    return <Icon className={styles.fail} of={'error-circle'} />;
  }
  if (status === 'pending') {
    return <Icon className={styles.pendingIcon} of={'pending'} />;
  }
  if (status === 'skipped') {
    return <Icon className={styles.skippedIcon} of={'skipped'} />;
  }
  return '';
}

export function timeFormat(time: number) {
  if (time < 1000) {
    return humanizeDuration(time, { units: ['ms'] });
  }
  return humanizeDuration(time);
}
