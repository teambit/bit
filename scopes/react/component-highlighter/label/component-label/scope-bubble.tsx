import React from 'react';
import classNames from 'classnames';

import { ComponentID } from '@teambit/component-id';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';

import styles from './duo-component-bubble.module.scss';

export interface ScopeBubbleProps extends LinkProps {
  componentId: ComponentID;
}

export function ScopeBubble({ componentId, className, ...rest }: ScopeBubbleProps) {
  const scope = componentId.scope;

  return (
    <NativeLink className={classNames(styles.scopeName, className)} href="https://bit.dev/teambit/base-ui" {...rest}>
      {scope}
    </NativeLink>
  );
}
