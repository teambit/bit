import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { ReactNode } from 'react';

import styles from './drawer.module.scss';

export type DrawerProps = {
  name: ReactNode;
  isOpen: boolean;
  onToggle: (event: React.MouseEvent<HTMLDivElement>) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function DrawerUI({ name, children, className, isOpen, onToggle, ...rest }: DrawerProps) {
  if (!name) return null;
  return (
    <div {...rest} className={classNames(styles.drawer, className)}>
      <div className={classNames(styles.drawerName, { [styles.open]: isOpen })}>
        <div onClick={onToggle}>
          <Icon className={classNames(styles.arrow, { [styles.collapsed]: !isOpen })} of="fat-arrow-down" />
          <span>{name}</span>
        </div>
      </div>

      <div className={classNames(styles.drawerContent, { [styles.open]: isOpen })}>{children}</div>
    </div>
  );
}
