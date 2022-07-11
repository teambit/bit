import React from 'react';
import { Link as BaseLink, LinkProps } from '@teambit/base-react.navigation.link';

import styles from './link.module.scss';

export function Link(props: LinkProps) {
  return <BaseLink {...props} className={styles.link} external />;
}
