import { Icon } from '@teambit/evangelist.elements.icon';
import { NavLink } from '@teambit/react-router';
import classNames from 'classnames';
import React from 'react';

import { Drawer } from '../../drawer';
import styles from './drawer.module.scss';

export type DrawerProps = {
  drawer: Drawer;
  isOpen: boolean;
  onToggle: (event: React.MouseEvent<HTMLDivElement>) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function DrawerUI({ drawer, className, isOpen, onToggle, ...rest }: DrawerProps) {
  if (!drawer) return null;
  return (
    <div {...rest} className={classNames(styles.drawer, className)}>
      <div className={classNames(styles.drawerName, { [styles.open]: isOpen })}>
        <div onClick={onToggle}>
          <Icon className={classNames(styles.arrow, { [styles.collapsed]: !isOpen })} of="fat-arrow-down" />
          <span>{drawer.name}</span>
        </div>
        <NavLink href="/" className={styles.link}>
          <Icon of="comps" />
        </NavLink>
      </div>

      <div className={classNames(styles.drawerContent, { [styles.open]: isOpen })}>
        <drawer.render />
      </div>
    </div>
  );
}
