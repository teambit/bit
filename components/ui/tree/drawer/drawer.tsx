import { Icon } from '@teambit/evangelist.elements.icon';
import classNames from 'classnames';
import React, { ReactNode, ComponentType } from 'react';

import styles from './drawer.module.scss';

export type DrawerProps = {
  name: ReactNode;
  isOpen: boolean;
  onToggle: (event: React.MouseEvent<HTMLDivElement>) => void;
  Widgets?: ReactNode[];
  Context?: ComponentType<any>;
  contentClass?: string;
  drawerNameClass?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function DrawerUI({
  name,
  children,
  className,
  isOpen,
  onToggle,
  Widgets,
  Context = Noop,
  contentClass,
  drawerNameClass,
  ...rest
}: DrawerProps) {
  // consider passing the entire drawer type instead of passing each parameter
  if (!name) return null;

  return (
    <div {...rest} className={classNames(styles.drawer, className)}>
      <Context>
        <div className={classNames(styles.drawerName, isOpen && styles.open, drawerNameClass)}>
          <div onClick={onToggle}>
            <Icon className={classNames(styles.arrow, !isOpen && styles.collapsed)} of="fat-arrow-down" />
            <span>{name}</span>
          </div>
          {Widgets?.map((Widget, index) => (
            <React.Fragment key={index}>{Widget}</React.Fragment>
          ))}
        </div>
        <div className={classNames(styles.drawerContent, contentClass, isOpen && styles.open)}>{children}</div>
      </Context>
    </div>
  );
}

function Noop({ children }: { children }) {
  return <>{children}</>;
}
