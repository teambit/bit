import React, { HTMLAttributes } from 'react';
import classnames from 'classnames';
import { BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';

import styles from './lane-compare-loader.module.scss';

export type LaneCompareLoaderProps = {} & HTMLAttributes<HTMLDivElement>;

export function LaneCompareLoader({ className, ...rest }: LaneCompareLoaderProps) {
  return (
    <div {...rest} className={classnames(className, styles.loader)}>
      <BlockSkeleton />
      <BlockSkeleton />
      <BlockSkeleton />
      <BlockSkeleton />
      <BlockSkeleton />
      <BlockSkeleton />
      <BlockSkeleton />
      <BlockSkeleton />
    </div>
  );
}
