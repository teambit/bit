import React from 'react';
import classNames from 'classnames';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import type { ComponentID } from '@teambit/component-id';

import { bubble } from '../../bubble';
import styles from './duo-component-bubble.module.scss';

import { ComponentBubble } from './component-bubble';
import { ScopeBubble } from './scope-bubble';

export interface ComponentLabelProps extends CardProps {
  componentId: ComponentID;
  link?: string;
  scopeLink?: string;
  local?: boolean;
}

export function ComponentLabel({ componentId, className, link, scopeLink, local, ...rest }: ComponentLabelProps) {
  return (
    <Card {...rest} className={classNames(className, styles.duoComponentBubble)} data-ignore-component-highlight>
      <ScopeBubble href={scopeLink} componentId={componentId} className={bubble} data-ignore-component-highlight />
      <ComponentBubble
        href={link}
        componentId={componentId}
        className={bubble}
        local={local}
        data-ignore-component-highlight
      />
    </Card>
  );
}
