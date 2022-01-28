import React from 'react';
import { EmptyComponentGallery, EmptyComponentGalleryProps } from '@teambit/ui-foundation.ui.empty-component-gallery';
import styles from './empty-lane-overview.module.scss';

export type EmptyLaneProps = { name: string } & EmptyComponentGalleryProps;

/**
 * A component to show when the scope is empty
 */
export function EmptyLane({ name }: EmptyLaneProps) {
  return (
    <EmptyComponentGallery name={name}>
      <div className={styles.text}>Start by adding new components to this Lane.</div>
    </EmptyComponentGallery>
  );
}
