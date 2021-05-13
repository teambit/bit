import React from 'react';
import classnames from 'classnames';

import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { pillClass } from '@teambit/base-ui.css-components.pill';
import { NativeLink } from '@teambit/base-ui.routing.native-link';

import { bubble } from '../../bubble';
import styles from './default-label.module.scss';

export interface DefaultLabelProps extends CardProps {
  href?: string;
}

export function DefaultLabel({ className, href, children, ...rest }: DefaultLabelProps) {
  return (
    <Card {...rest} className={classnames(styles.container, className)}>
      <NativeLink external href={href} className={classnames(pillClass, bubble)}>
        {children}
      </NativeLink>
    </Card>
  );
}
