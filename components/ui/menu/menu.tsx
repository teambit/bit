import { MainDropdown, MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import classNames from 'classnames';
import React, { useMemo, ComponentType } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { flatten, groupBy } from 'lodash';

import styles from './menu.module.scss';

export type MenuWidget = ComponentType;

export type MenuWidgetSlot = SlotRegistry<MenuWidget[]>;

export type MenuProps = {
  className?: string;
  /**
   * slot for scope menu items
   */
  menuSlot?: MenuWidgetSlot;
  /**
   * slot for scope menu items
   */
  widgetSlot?: MenuWidgetSlot;

  /**
   * main dropdown menu item slot
   */
  menuItemSlot?: MenuItemSlot;
};

/**
 * base menu.
 */
export function Menu({ menuSlot, widgetSlot, menuItemSlot, className }: MenuProps) {
  const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot?.values()), 'category'), [menuItemSlot]);
  const widgets = flatten(widgetSlot?.values());
  const menuItems = flatten(menuSlot?.values());

  return (
    <div className={classNames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        {menuItems &&
          menuItems.map((Item: MenuWidget, index) => {
            return <Item key={index} />;
          })}
      </div>
      <div className={styles.rightSide}>
        {widgets &&
          widgets.map((Widget: MenuWidget, index) => {
            return <Widget key={index} />;
          })}
        <MainDropdown menuItems={mainMenuItems} />
      </div>
    </div>
  );
}
