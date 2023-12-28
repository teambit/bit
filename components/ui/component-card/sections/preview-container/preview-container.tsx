import React, { ComponentType } from 'react';
import classNames from 'classnames';

import styles from './preview-container.module.scss';

export type PreviewContainerProps = {
  preview?: any;
  PreviewBottomRightPlugin?: ComponentType<{ component: any }>;
  PreviewBottomLeftPlugin?: ComponentType<{ component: any }>;
  component: any;
} & React.HTMLAttributes<HTMLDivElement>;

export function PreviewContainer({
  preview,
  className,
  PreviewBottomRightPlugin,
  PreviewBottomLeftPlugin,
  component,
  ...rest
}: PreviewContainerProps) {
  return (
    <div {...rest} className={classNames(styles.previewContainer, className)}>
      <div
        className={classNames(styles.preview, {
          [styles.emptyPreview]: !preview,
        })}
      >
        {preview}
        <div className={styles.previewBottomLeftPlugin}>
          {PreviewBottomLeftPlugin && <PreviewBottomLeftPlugin component={component} />}
        </div>
        <div className={styles.previewBottomRightPlugin}>
          {PreviewBottomRightPlugin && <PreviewBottomRightPlugin component={component} />}
        </div>
      </div>
    </div>
  );
}
