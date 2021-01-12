import React from 'react';
import { ExternalLink, ExternalLinkProps } from '@teambit/documenter.routing.external-link';
import styles from './link.module.scss';

export function Link(props: ExternalLinkProps) {
  return <ExternalLink {...props} className={styles.link} />;
}
