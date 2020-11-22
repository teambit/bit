import React from 'react';
import { BaseComponentCard, BaseComponentCardProps } from '@teambit/ui.gallery.base-component-card';
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
  // ciStatus,
  // size,
  envIcon,
  isDeprecated,
}: // isIntetnal,
ComponentCardProps) {
  return (
    <BaseComponentCard
      id={id}
      version={version}
      preview={preview}
      description={description}
      isDeprecated={isDeprecated}
      className={className}
    >
      <div className={styles.bottom}>
        <div className={styles.left}></div>
        <img src={envIcon} className={styles.img} />
      </div>
    </BaseComponentCard>
  );
}

ComponentCard.defaultProps = {
  isDeprecated: false,
};

// function CiStatus() {
//   return <span className={styles.dot}></span>;
// }
