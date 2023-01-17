import React from 'react';
import { LineSkeleton, BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
import styles from './composition-card-skeleton.module.scss';

export function CompositionCardSkeleton() {
  return (
    <div className={styles.compositionCardSkeleton}>
      <PreviewSkeleton />
      <div className={styles.bottom}>
        <LineSkeleton width="104px" />
      </div>
    </div>
  );
}

export function PreviewSkeleton() {
  return (
    <div className={styles.preview}>
      <BlockSkeleton lines={2} className={styles.block} />
      <LineSkeleton width="208px" />
      <LineSkeleton width="152px" />
      <LineSkeleton width="88px" />
    </div>
  );
}
