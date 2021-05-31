import React from 'react';
import { Link as RoutingLink, LinkProps } from '@teambit/base-ui.routing.link';

import styles from './link.module.scss';

export function Link(props: LinkProps) {
  return <RoutingLink {...props} className={styles.link} external />;
}
