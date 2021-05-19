import React from 'react';
import { Link } from '@teambit/base-ui.routing.link';
import {
  BaseComponentCardProps,
  PreviewContainer,
  DeprecationSticker,
  ComponentDetails,
  Card,
} from '@teambit/explorer.ui.gallery.base-component-card';

import styles from './component-card.module.scss';

export type ComponentCardProps = {
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
   * the status of the component
   */
  ciStatus?: string;
  /**
   * the size of the component
   */
  size?: number;
  /**
   * the framework used to build the component
   */
  envIcon?: string;
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
  /**
   * true if the component is internal
   */
  isInternal?: boolean;
} & BaseComponentCardProps;

export function ComponentCard({
  id = '',
  className,
  preview,
  version,
  description,
  envIcon,
  isDeprecated,
}: ComponentCardProps) {
  return (
    <Card className={className}>
      <Link className={styles.componentCardLink} href={id}>
        <DeprecationSticker isDeprecated={isDeprecated} />
        <PreviewContainer preview={preview} />

        <ComponentDetails id={id} version={version} description={description} className={styles.content} />
        <div className={styles.bottom}>
          <div className={styles.left}></div>
          <img src={envIcon} className={styles.img} />
        </div>
      </Link>
    </Card>
  );
}

ComponentCard.defaultProps = {
  isDeprecated: false,
};
