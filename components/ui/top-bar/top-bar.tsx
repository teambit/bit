import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
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
}

/**
 * Top bar with corner and contextual menu.
 */
export function TopBar({ Corner, menu, className, ...rest }: TopBarProps) {
  return (
    <div {...rest} className={cn(styles.topbar, className)}>
      <Corner />
      <SlotRouter slot={menu} />
    </div>
  );
}
