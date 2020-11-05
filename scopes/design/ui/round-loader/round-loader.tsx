import React from 'react';
import classNames from 'classnames';
import styles from './round-loader.module.scss';

export type RoundLoaderProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function RoundLoader({ className, ...rest }: RoundLoaderProps) {
  return <div {...rest} className={classNames(styles.loader, className)} />;
}
