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
  return '';
}

export function getBorderColor(pass: number, failed: number, pending: number) {
  if (failed > 0) return '#e62e5c';
  if (pending > 0) return 'yellow';
  if (pass > 0) return '#37b26c';
  return '';
}
