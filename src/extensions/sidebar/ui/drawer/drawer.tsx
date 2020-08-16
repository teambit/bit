import React from 'react';
import classNames from 'classnames';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import { Drawer } from '../drawer';
import { hoverable } from '../../../../to-eject/css-components/hoverable';
import styles from './drawer.module.scss';

export type DrawerProps = {
  drawer: Drawer;
  isOpen: boolean;
  onToggle: (event: React.MouseEvent<HTMLDivElement>) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function DrawerUI({ drawer, className, isOpen, onToggle, ...rest }: DrawerProps) {
  return (
    <div {...rest} className={classNames(styles.drawer, className)}>
      <div className={classNames(hoverable, styles.drawerName, { [styles.open]: isOpen })} onClick={onToggle}>
        <div>
          <Icon className={classNames(styles.arrow, { [styles.collapsed]: !isOpen })} of="fat-arrow-down" />
          {drawer.name}
        </div>
        <Icon of="comps" className={styles.icon} />
      </div>

      <div className={classNames(styles.drawerContent, { [styles.open]: isOpen })}>
        <drawer.component />
      </div>
    </div>
  );
}
