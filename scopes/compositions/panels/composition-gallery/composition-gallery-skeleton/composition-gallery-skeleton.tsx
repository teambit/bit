import React from 'react';
import classnames from 'classnames';
import { LineSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { CompositionCardSkeleton } from '@teambit/composition-card';
import styles from './composition-gallery-skeleton.module.scss';

export type CompositionGallerySkeletonProps = {
  compositionsLength: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function CompositionGallerySkeleton({
  compositionsLength,
  className,
  ...rest
}: CompositionGallerySkeletonProps) {
  const length = Array.from(Array(compositionsLength));
  return (
    <div {...rest} className={classnames(styles.compositionGallerySkeleton, className)}>
      <LineSkeleton width="100px" className={styles.title} />
      <div className={classnames(styles.compositionGalleryGrid)}>
        {length.map((_, index) => {
          return <CompositionCardSkeleton key={`comp-card-skeleton-${index}`} />;
        })}
      </div>
    </div>
  );
}
