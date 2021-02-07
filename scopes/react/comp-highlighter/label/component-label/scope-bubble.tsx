import React from 'react';
import classNames from 'classnames';

import { ComponentID } from '@teambit/component-id';

import styles from './duo-component-bubble.module.scss';

export type ScopeBubbleProps = {
  componentId: ComponentID;
  fullScopeName?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeBubble({ componentId, className, ...rest }: ScopeBubbleProps) {
  const scope = componentId.scope;

  return (
    <div className={classNames(styles.scopeName, className)} {...rest} data-ignore-component-highlight>
      {scope}
    </div>
  );
}
