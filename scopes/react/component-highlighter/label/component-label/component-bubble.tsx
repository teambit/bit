import { ComponentID } from '@teambit/component-id';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import classnames from 'classnames';
import React from 'react';
import styles from './duo-component-bubble.module.scss';

export interface ComponentBubbleProps extends LinkProps {
  componentId: ComponentID;
}

export function ComponentBubble({ componentId, className, ...rest }: ComponentBubbleProps) {
  const { version, fullName } = componentId;

  return (
    <NativeLink external {...rest} className={classnames(styles.componentName, className)}>
      <div className={styles.fullName}>{fullName}</div>

      {version && version !== 'latest' && (
        <div className={styles.version}>
          <span className={styles.versionPrefix}>@</span>
          {version}
        </div>
      )}
    </NativeLink>
  );
}
