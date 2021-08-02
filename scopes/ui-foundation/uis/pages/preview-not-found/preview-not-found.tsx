import React, { CSSProperties } from 'react';
import { fullPageToStaticString } from '@teambit/ui-foundation.ui.rendering.full-page';
import { ImageIcon } from './image-icon';

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',

    height: '100%',
    color: '#878c9a',

    fontSize: '18px',
    fontFamily: 'sans-serif', // TODO - replace
  },
  image: {
    width: '2.6em',
    marginBottom: '1em',
  },
  message: {
    fontSize: '1em',
  },
};

export function PreviewNotFoundPage() {
  return (
    <div className="bit-book-font" style={styles.container}>
      <ImageIcon style={styles.image} />
      <div style={styles.message}>No preview available</div>
    </div>
  );
}

export function stringifiedPreviewNotFoundPage(): string {
  return fullPageToStaticString(<PreviewNotFoundPage />, { title: 'Preview not found' });
}
