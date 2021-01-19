import React from 'react';
import classNames from 'classnames';

import styles from './card.module.scss';

export type CardProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function Card({ children, className }: CardProps) {
  return <div className={classNames(styles.componentCard, className)}>{children}</div>;
}
