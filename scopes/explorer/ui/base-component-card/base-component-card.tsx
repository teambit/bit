import React from 'react';
import classNames from 'classnames';
import { Link } from '@teambit/ui.routing.link';

import styles from './base-component-card.module.scss';

export type BaseComponentCardProps = {
  /**
   * the full name of the component
   */
  id: string;
  /**
   * the version of the component
   */
  version?: string;
  /**
   * the description of the component
   */
  description?: string;
  /**
   * override styles
   */
  className?: string;
  /**
   * preview renders the component image
   */
  preview?: any;
  /**
   * true if the component is deprecated
   */
  isDeprecated?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function BaseComponentCard({
  id = '',
  className,
  preview,
  version,
  description,
  isDeprecated,
  children,
}: BaseComponentCardProps) {
  const idArray = id.split('/');
  const nameSpace = idArray.length > 1 && idArray.slice(0, -1).join(' / ');
  const name = idArray.slice(-1);
  return (
    <div className={classNames(styles.componentCard, className)}>
      <Link href={id}>
        <div
          className={classNames(styles.deprecated, {
            [styles.show]: isDeprecated,
          })}
        >
          deprecated
        </div>
        <div className={styles.previewContainer}>
          <div
            className={classNames(styles.preview, {
              [styles.emptyPreview]: !preview,
            })}
          >
            {preview}
          </div>
        </div>
        <div className={styles.content}>
          <div>
            <div className={styles.nameSpace}>{nameSpace}</div>
            <div className={styles.name}>
              <span>{name}</span>
              <span>{version}</span>
            </div>
            <div className={styles.description}>{description}</div>
          </div>
          {children}
        </div>
      </Link>
    </div>
  );
}
