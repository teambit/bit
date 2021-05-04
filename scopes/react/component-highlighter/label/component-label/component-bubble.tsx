import React from 'react';
import classnames from 'classnames';
import { ComponentID } from '@teambit/component-id';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import { ComponentUrl } from '@teambit/component-url';
import styles from './duo-component-bubble.module.scss';

export interface ComponentBubbleProps extends LinkProps {
  componentId: ComponentID;
}

export function ComponentBubble({ componentId, className, href, ...rest }: ComponentBubbleProps) {
  const { version, fullName } = componentId;
  const componentHref = href || ComponentUrl.toUrl(componentId);

  return (
    <NativeLink external href={componentHref} className={classnames(styles.componentName, className)} {...rest}>
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
