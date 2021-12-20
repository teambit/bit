import React from 'react';
import classNames from 'classnames';
import styles from './tab.module.scss';

export type TabProps = {
  isActive?: boolean;
  onClick?: (target: string) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function Tab({ onClick, isActive, className, children, ...rest }: TabProps) {
  return (
    <div {...rest} className={classNames(styles.tab, isActive && styles.active, className)} onClick={onClick}>
      {children}
    </div>
  );
}
