import React from 'react';
import classNames from 'classnames';

import styles from './preview-container.module.scss';

export type PreviewContainerProps = {
  preview?: any;
} & React.HTMLAttributes<HTMLDivElement>;

export function PreviewContainer({ preview, className, ...rest }: PreviewContainerProps) {
  return (
    <div {...rest} className={classNames(styles.previewContainer, className)}>
      <div
        className={classNames(styles.preview, {
          [styles.emptyPreview]: !preview,
        })}
      >
        {preview}
      </div>
    </div>
  );
}
