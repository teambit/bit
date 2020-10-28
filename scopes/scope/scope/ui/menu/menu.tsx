// import { MainDropdown } from '@teambit/staged-components.main-dropdown';
import classnames from 'classnames';
import React from 'react';
import { flatten } from 'lodash';

import styles from './menu.module.scss';

import { MenuWidgetSlot, MenuWidget } from '../../scope.ui.runtime';

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
};

/**
 * scope menu.
 */
export function ScopeMenu({ menuSlot, widgetSlot, className }: MenuProps) {
  const widgets = flatten(widgetSlot?.values());
  const menuItems = flatten(menuSlot?.values());

  return (
    <div className={classnames(styles.topBar, className)}>
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
        {/* <MainDropdown /> */}
      </div>
    </div>
  );
}
