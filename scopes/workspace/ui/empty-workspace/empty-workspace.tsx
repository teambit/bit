import React from 'react';
import { EmptyComponentGallery, EmptyComponentGalleryProps } from '@teambit/ui-foundation.ui.empty-component-gallery';
import styles from './empty-workspace.module.scss';

export type EmptyWorkspaceProps = { name: string } & EmptyComponentGalleryProps;

/**
 * A component to show when the workspace is empty
 */
export function EmptyWorkspace({ name }: EmptyWorkspaceProps) {
  return (
    <EmptyComponentGallery name={name}>
      <div className={styles.text}>Start by adding new components to this workspace.</div>
    </EmptyComponentGallery>
  );
}
