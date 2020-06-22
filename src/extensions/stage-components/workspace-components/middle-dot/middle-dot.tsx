import React from 'react';
import classNames from 'classnames';
import styles from './middle-dot.module.scss';

type MiddleDotProps = {} & React.HTMLAttributes<HTMLSpanElement>;

export function MiddleDot({ className }: MiddleDotProps) {
  return <span className={classNames(styles.middleDot, className)}>&middot;</span>;
}
