import React from 'react';
import { EmptyComponentGallery, EmptyComponentGalleryProps } from '@teambit/ui-foundation.ui.empty-component-gallery';

import styles from './empty-lane-overview.module.scss';

export type EmptyLaneProps = { message: string } & EmptyComponentGalleryProps;

/**
 * A component to show when the scope is empty
 */
export function EmptyLane({ message, ...rest }: EmptyLaneProps) {
  return (
    <EmptyComponentGallery {...rest}>
      <div className={styles.text}>{message}</div>
    </EmptyComponentGallery>
  );
}
