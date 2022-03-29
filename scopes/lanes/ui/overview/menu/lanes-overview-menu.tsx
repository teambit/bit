import { MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { SlotRegistry } from '@teambit/harmony';
import classnames from 'classnames';
import React from 'react';
import { NavLink, NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { extendPath } from '@teambit/ui-foundation.ui.react-router.extend-path';
import flatten from 'lodash.flatten';
import { useRouteMatch, useLocation } from 'react-router-dom';
import styles from './lanes-overview-menu.module.scss';

export type NavPlugin = {
  props: NavLinkProps;
  order?: number;
  hide?: () => boolean;
};

export type LanesOrderedNavigationSlot = SlotRegistry<NavPlugin[]>;

export type LanesOverviewMenuProps = {
  className?: string;
  /**
   * slot for top bar menu nav items
   */
  navigationSlot: LanesOrderedNavigationSlot;
  /**
   * right side menu item slot
   */
  widgetSlot?: LanesOrderedNavigationSlot;
  host: string;
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
export function LanesOverviewMenu({ navigationSlot, className }: LanesOverviewMenuProps) {
  //   const mainMenuItems = useMemo(() => groupBy(flatten(menuItemSlot.values()), 'category'), [menuItemSlot]);

  return (
    <div className={classnames(styles.topBar, className)}>
      <div className={styles.leftSide}>
        <MenuNav navigationSlot={navigationSlot} />
      </div>
      {/* <div className={styles.rightSide}>
        <div className={styles.widgets}>
          <MenuNav navigationSlot={widgetSlot} />
        </div>
        <MainDropdown menuItems={mainMenuItems} />
      </div> */}
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

function sortFn({ order: first }: NavPlugin, { order: second }: NavPlugin) {
  // 0  - equal
  // <0 - first < second
  // >0 - first > second

  return (first ?? 0) - (second ?? 0);
}

/** TODO: replace it with tab-link */
function TopBarNav(props: NavLinkProps) {
  const { url } = useRouteMatch();
  const { search, pathname } = useLocation(); // sticky query params
  const { href } = props;
  const target = `${extendPath(url, href)}${search}`;

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.className, target === pathname && styles.active)}
      href={target}
    >
      <div>{props.children}</div>
    </NavLink>
  );
}
