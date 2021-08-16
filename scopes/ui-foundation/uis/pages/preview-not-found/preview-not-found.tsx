import React, { CSSProperties } from 'react';
import { ImageIcon } from './image-icon';

const styles: Record<string, CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',

    height: '100%',
  },
  image: {
    width: '2.6em',
    marginBottom: '1em',
  },
  message: {
    fontSize: '1em',
    textAlign: 'center',
  },
};

export type PreviewNotFoundPageProps = React.HTMLAttributes<HTMLDivElement>;

export function PreviewNotFoundPage(props: PreviewNotFoundPageProps) {
  return (
    <div {...props} style={{ ...styles.container, ...props.style }}>
      <ImageIcon style={styles.image} />
      <div style={styles.message}>No preview available</div>
    </div>
  );
}
