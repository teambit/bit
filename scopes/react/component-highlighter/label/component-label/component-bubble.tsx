import { ComponentID } from '@teambit/component-id';
import classnames from 'classnames';
import React from 'react';
import styles from './duo-component-bubble.module.scss';

export type ComponentBubbleProps = {
  componentId: ComponentID;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentBubble({ componentId, className, ...rest }: ComponentBubbleProps) {
  const { version, fullName } = componentId;

  return (
    <div className={classnames(styles.componentName, className)} {...rest}>
      <div className={styles.fullName}>{fullName}</div>

      {version && version !== 'latest' && (
        <div className={styles.version}>
          <span className={styles.versionPrefix}>@</span>
          {version}
        </div>
      )}
    </div>
  );
}
