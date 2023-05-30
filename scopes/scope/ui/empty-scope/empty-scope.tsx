import React from 'react';
import { EmptyComponentGallery, EmptyComponentGalleryProps } from '@teambit/ui-foundation.ui.empty-component-gallery';
import { HighlightedText } from '@teambit/documenter.ui.highlighted-text';
import styles from './empty-scope.module.scss';

export type EmptyScopeProps = { name: string } & EmptyComponentGalleryProps;

/**
 * A component to show when the scope is empty
 */
export function EmptyScope({ name }: EmptyScopeProps) {
  return (
    <EmptyComponentGallery name={name} title={'Export components to'}>
      <div className={styles.text}>
        <span>Set</span> <HighlightedText>{`"defaultScope": "${name}"`}</HighlightedText> <span>in</span>{' '}
        <HighlightedText>workspace.jsonc</HighlightedText> <div>file and export components here.</div>
      </div>
    </EmptyComponentGallery>
  );
}
