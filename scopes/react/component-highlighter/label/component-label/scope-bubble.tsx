import React from 'react';
import classNames from 'classnames';

import { ComponentID } from '@teambit/component-id';
import { NativeLink, LinkProps } from '@teambit/ui.routing.native-link';
import { ScopeUrl } from '@teambit/component-url';

import styles from './duo-component-bubble.module.scss';

export interface ScopeBubbleProps extends LinkProps {
  componentId: ComponentID;
}

export function ScopeBubble({ componentId, className, href, ...rest }: ScopeBubbleProps) {
  const scope = componentId.scope;
  const scopeUrl = href || ScopeUrl.toUrl(componentId.scope);

  return (
    <NativeLink href={scopeUrl} external className={classNames(styles.scopeName, className)} {...rest}>
      {scope}
    </NativeLink>
  );
}
