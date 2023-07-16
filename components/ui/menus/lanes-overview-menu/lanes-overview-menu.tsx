import React from 'react';
import classnames from 'classnames';
import flatten from 'lodash.flatten';
import { useLocation } from 'react-router-dom';
import { MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { SlotRegistry } from '@teambit/harmony';
import { Link, LinkProps } from '@teambit/base-react.navigation.link';
import { Menu, MenuWidgetSlot } from '@teambit/ui-foundation.ui.menu';
import styles from './lanes-overview-menu.module.scss';

export type LanesNavPlugin = {
  props: LinkProps;
  order?: number;
  hide?: () => boolean;
};
export type LanesOrderedNavigationSlot = SlotRegistry<LanesNavPlugin[]>;

export type LanesOverviewMenuProps = {
  className?: string;
  /**
   * slot for top bar menu nav items
   */
  navigationSlot: LanesOrderedNavigationSlot;
  /**
   * right side menu item slot
   */
  widgetSlot?: MenuWidgetSlot;
  /**
   * main dropdown item slot
   */
  menuItemSlot?: MenuItemSlot;
};
/**
 * top bar menu.
 * Note: Currently it has been copied from menu.tsx (scope/component/component/ui/menu)
 * Once tab-link component is ready update it
 */
export function LanesOverviewMenu({ navigationSlot, widgetSlot, className }: LanesOverviewMenuProps) {
  //   const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);

  return (
    <div className={classnames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        <MenuNav navigationSlot={navigationSlot} />
      </div>
      <div className={styles.rightSide}>
        <div className={styles.widgets}>
          <Menu widgetSlot={widgetSlot} />
        </div>
      </div>
    </div>
  );
}
function MenuNav({ navigationSlot }: { navigationSlot: LanesOrderedNavigationSlot }) {
  const plugins = flatten(
    navigationSlot.toArray().map(([id, values]) => {
      const flattenedValues = flatten(values).map((value) => ({ ...value, id }));
      return flattenedValues;
    })
  ).sort(sortFn);

  return (
    <nav className={styles.navigation}>
      {plugins.map((menuItem, index) => {
        const hidden = menuItem.hide?.();
        if (hidden) return null;
        return <TopBarNav key={`${menuItem.id}-${index}`} {...menuItem.props} />;
      })}
    </nav>
  );
}

function sortFn({ order: first }: LanesNavPlugin, { order: second }: LanesNavPlugin) {
  // 0  - equal
  // <0 - first < second
  // >0 - first > second

  return (first ?? 0) - (second ?? 0);
}

/** TODO: replace it with tab-link */
function TopBarNav(props: LinkProps) {
  const { search } = useLocation(); // sticky query params
  const { href } = props;

  const target = `${href}${search}`;

  return (
    <Link
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.activeClassName, styles.active)}
      href={target}
    >
      <div>{props.children}</div>
    </Link>
  );
}
