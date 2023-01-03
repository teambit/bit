import React from 'react';
import classnames from 'classnames';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { CompositionCardSkeleton } from '@teambit/composition-card';
import styles from './composition-gallery-skeleton.module.scss';

export type ComponentGallerySkeletonProps = {
  compositionsLength: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentGallerySkeleton({ compositionsLength, className, ...rest }: ComponentGallerySkeletonProps) {
  const length = Array.from(Array(compositionsLength));
  return (
    <div {...rest} className={classnames(styles.compositionGallerySkeleton, className)}>
      <LineSkeleton width="100px" className={styles.title} />
      <div className={classnames(styles.compositionGalleryGrid)}>
        {length.map((i) => (
          <CompositionCardSkeleton />
        ))}
      </div>
    </div>
  );
}
