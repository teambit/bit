import React from 'react';
import { EmptyComponentGallery, EmptyComponentGalleryProps } from '@teambit/ui-foundation.ui.empty-component-gallery';
import styles from './empty-lane-overview.module.scss';

export type EmptyLaneOverviewProps = {} & EmptyComponentGalleryProps;

/**
 * A component to show when the scope is empty
 */
export function EmptyLaneOverview(props: EmptyLaneOverviewProps) {
  return (
    <EmptyComponentGallery {...props}>
      <div className={styles.text}>Start by snapping components to this Lane.</div>
    </EmptyComponentGallery>
  );
}
