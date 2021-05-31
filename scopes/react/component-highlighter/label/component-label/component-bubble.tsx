import React from 'react';
import classnames from 'classnames';
import { ComponentID } from '@teambit/component-id';
import { NativeLink, LinkProps } from '@teambit/base-ui.routing.native-link';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import urljoin from 'url-join';
import styles from './duo-component-bubble.module.scss';

export interface ComponentBubbleProps extends LinkProps {
  componentId: ComponentID;
  local?: boolean;
}

export function ComponentBubble({ componentId, className, href, local = false, ...rest }: ComponentBubbleProps) {
  const { version, fullName } = componentId;
  const componentHref = href || (local ? urljoin('/', fullName) : ComponentUrl.toUrl(componentId));

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
