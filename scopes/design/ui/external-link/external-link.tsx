import React from 'react';
import classNames from 'classnames';
import styles from './external-link.module.scss';

export type ExternalLinkProps = {} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export function ExternalLink({ href, children, className, ...rest }: ExternalLinkProps) {
  return (
    // @ts-ignore remove all rest to <a> in react 17
    <a {...rest} target="_blank" rel="noreferrer" href={href} className={classNames(styles.link, className)}>
      {children}
    </a>
  );
}
