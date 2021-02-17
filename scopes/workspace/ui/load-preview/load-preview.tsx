import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './load-preview.module.scss';

export type LoadPreviewProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function LoadPreview({ onClick, className, ...rest }: LoadPreviewProps) {
  return (
    <div className={classNames(styles.loadPreview, className)} onClick={onClick} {...rest}>
      <Icon of="fat-arrow-down" className={styles.icon} />
      <span>Live preview</span>
    </div>
  );
}
