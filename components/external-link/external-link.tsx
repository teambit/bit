import React from 'react';
import styles from './external-link.module.scss';

export type ExternalLinkProps = {} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function ExternalLink({ href, children, ...rest }: ExternalLinkProps) {
  return (
    <a {...rest} target="_blank" href={href} className={styles.link}>
      {children}
    </a>
  );
}
