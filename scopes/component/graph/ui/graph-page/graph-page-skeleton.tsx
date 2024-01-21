import React from 'react';
import { H2 } from '@teambit/documenter.ui.heading';

import styles from './graph-page.module.scss';

export function GraphPageSkeleton() {
  return (
    <div className={styles.graphPageSkeleton}>
      <H2 size="xs">Component Dependencies</H2>
      <div className={styles.block} />
    </div>
  );
}
