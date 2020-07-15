import React from 'react';
import classNames from 'classnames';
import styles from './separator.module.scss';

type SeparatorProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function Separator({ className, ...rest }: SeparatorProps) {
  return <hr className={classNames(styles.separator, className)} {...rest} />;
}
