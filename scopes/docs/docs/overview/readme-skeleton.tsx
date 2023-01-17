import React from 'react';
import { LineSkeleton, BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
import styles from './overview.module.scss';

export function ReadmeSkeleton() {
  return (
    <div className={styles.readmeSkeleton}>
      <LineSkeleton width="80%" />
      <LineSkeleton width="70%" />
      <LineSkeleton width="40%" style={{marginBottom: 40}} />

      <LineSkeleton width="30%" style={{marginBottom: 16}} />
      <BlockSkeleton lines={10} style={{width: '100%', marginBottom: 40}} />
      <LineSkeleton width="80%" />
      <LineSkeleton width="40%" />
      <LineSkeleton width="25%" />
    </div>
  );
}
