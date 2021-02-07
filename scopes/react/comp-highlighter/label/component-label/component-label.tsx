import React from 'react';
import classNames from 'classnames';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import type { ComponentID } from '@teambit/component-id';

import styles from './duo-component-bubble.module.scss';

import { ComponentBubble } from './component-bubble';
import { ScopeBubble } from './scope-bubble';

export type ComponentLabelProps = {
  componentId: ComponentID;
} & CardProps;

export function ComponentLabel({ componentId, className, ...rest }: ComponentLabelProps) {
  return (
    <Card {...rest} className={classNames(className, styles.duoComponentBubble)} data-ignore-component-highlight>
      <ScopeBubble componentId={componentId} className={styles.scopeBubble} />
      <ComponentBubble componentId={componentId} />
    </Card>
  );
}
