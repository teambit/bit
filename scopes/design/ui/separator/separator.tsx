import classNames from 'classnames';
import React from 'react';
import styles from './separator.module.scss';

export function Separator({ className, ...rest }: any) {
  return <div className={classNames(styles.separator, className)} {...rest}></div>;
}
