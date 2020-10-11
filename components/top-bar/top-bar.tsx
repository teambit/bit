import { RouteSlot, SlotRouter } from '@teambit/react-router';
import cn from 'classnames';
import React from 'react';
import styles from './top-bar.module.scss';

export interface TopBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * top left corner of the top bar.
   */
  Corner: React.ComponentType;

  /**
   * slot for registering menus to the top-bar.
   */
  menu: RouteSlot;

  /**
   * widgets to show on the right of the scope menu
   */
  widgets: React.ComponentType[];
}

/**
 * Top bar with corner and contextual menu.
 */
export function TopBar({ Corner, menu, className, widgets, ...rest }: TopBarProps) {
  return (
    <div {...rest} className={cn(styles.topbar, className)}>
      <Corner />
      <SlotRouter slot={menu} />
      {widgets &&
        widgets.map((Widget, index) => {
          return <Widget key={index} />;
        })}
    </div>
  );
}
