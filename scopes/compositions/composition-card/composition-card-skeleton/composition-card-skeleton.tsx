import React from 'react';
import { LineSkeleton, WordSkeleton, BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
import styles from './composition-card-skeleton.module.scss';

export function CompositionCardSkeleton() {
  return (
    <div className={styles.compositionCardSkeleton}>
      <div className={styles.preview}>
        {/* <BlockSkeleton className={styles.preview}> */}
            <BlockSkeleton /* style={{color: 'grey'}} */ lines={3} />
          <LineSkeleton /* style={{color: 'grey'}} */ width="100px" />
          <LineSkeleton /* style={{color: 'grey'}} */ width="150px" />
          <LineSkeleton /* style={{color: 'grey'}} */ width="80px" />
        {/* </BlockSkeleton> */}
      </div>
      <div className={styles.bottom}>
        <WordSkeleton length={6} />
        <WordSkeleton length={10} />
      </div>
    </div>
  );
}
