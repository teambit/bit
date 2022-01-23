import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { ReactNode, ComponentType } from 'react';

import styles from './drawer.module.scss';

export type DrawerProps = {
  name: ReactNode;
  isOpen: boolean;
  onToggle: (event: React.MouseEvent<HTMLDivElement>) => void;
  Widget?: ReactNode;
  Context?: ComponentType<any>;
} & React.HTMLAttributes<HTMLDivElement>;

export function DrawerUI({
  name,
  children,
  className,
  isOpen,
  onToggle,
  Widget,
  Context = Noop,
  ...rest
}: DrawerProps) {
  // consider passing the entire drawer type instead of passing each parameter
  if (!name) return null;
  return (
    <div {...rest} className={classNames(styles.drawer, className)}>
      <Context>
        <div className={classNames(styles.drawerName, { [styles.open]: isOpen })}>
          <div onClick={onToggle}>
            <Icon className={classNames(styles.arrow, { [styles.collapsed]: !isOpen })} of="fat-arrow-down" />
            <span>{name}</span>
          </div>
          {Widget}
        </div>

        <div className={classNames(styles.drawerContent, { [styles.open]: isOpen })}>{children}</div>
      </Context>
    </div>
  );
}

function Noop({ children }: { children }) {
  return <>{children}</>;
}
