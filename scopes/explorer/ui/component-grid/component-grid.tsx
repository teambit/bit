import React from 'react';
import classNames from 'classnames';
import styles from './component-grid.module.scss';

export type ComponentGridProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentGrid({ children, className, ...rest }: ComponentGridProps) {
  return (
    <div className={classNames(styles.componentGrid, className)} {...rest}>
      {children}
    </div>
  );
}
