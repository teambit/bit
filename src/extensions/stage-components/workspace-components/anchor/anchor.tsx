import React from 'react';
import classNames from 'classnames';
import styles from './anchor.module.scss';

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement>;
export function Anchor(props: AnchorProps) {
  const href = props.href && `#${props.href}`;

  return (
    <a {...props} id={props.href} href={href} className={classNames(props.className, styles.anchor)}>
      <span>🔗</span>
    </a>
  );
}
