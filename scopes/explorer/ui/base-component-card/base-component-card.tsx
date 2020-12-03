import React, { ComponentType } from 'react';
import { Link } from '@teambit/ui.routing.link';
import { PreviewContainer } from './preview-container';
import { DeprecationSticker } from './deprecation-sticker';
import { ComponentDetails } from './details';
import { Card } from './card';

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
   * override content section styles
   */
  contentClass?: string;
  /**
   * preview renders the component image
   */
  preview?: any;
  /**
   * true if the component is deprecated
   */
  isDeprecated?: boolean;
  /**
   * avatar component
   */
  avatar?: ComponentType;
} & React.HTMLAttributes<HTMLDivElement>;

export function BaseComponentCard({
  id = '',
  className,
  preview,
  version,
  description,
  isDeprecated,
  children,
  avatar,
  contentClass,
}: BaseComponentCardProps) {
  return (
    <Card className={className}>
      <Link href={id} className={styles.link}>
        <DeprecationSticker isDeprecated={isDeprecated} />
        <PreviewContainer preview={preview} />
        <div className={styles.avatarContainer}>{avatar}</div>
        <ComponentDetails id={id} version={version} description={description} className={contentClass} />
        {children}
      </Link>
    </Card>
  );
}
