import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './tab.module.scss';

export type TabProps = {
  isActive: boolean;
  title: string;
  icon: string;
  onClick: (target: string) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function Tab({ onClick, isActive, title, icon, className, ...rest }: TabProps) {
  return (
    <div
      {...rest}
      className={classNames(styles.tab, isActive && styles.active, className)}
      onClick={() => onClick(title)}
    >
      <Icon of={icon} />
    </div>
  );
}
