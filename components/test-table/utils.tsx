import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
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
