import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist.elements.icon';
import styles from './tab.module.scss';

export type TabProps = {
  isActive?: boolean;
  icon: string;
  onClick: (target: string) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function Tab({ onClick, isActive, icon, className, ...rest }: TabProps) {
  return (
    <div {...rest} className={classNames(styles.tab, isActive && styles.active, className)} onClick={onClick}>
      <Icon of={icon} />
    </div>
  );
}
