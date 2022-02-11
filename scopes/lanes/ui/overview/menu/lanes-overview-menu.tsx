import { MenuItemSlot } from '@teambit/ui-foundation.ui.main-dropdown';
import { SlotRegistry } from '@teambit/harmony';
import classnames from 'classnames';
import React from 'react';
import { NavLink, NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { extendPath } from '@teambit/ui-foundation.ui.react-router.extend-path';
import { useRouteMatch, useLocation } from 'react-router-dom';
import styles from './lanes-overview-menu.module.scss';

export type NavPlugin = {
  props: NavLinkProps;
  order?: number;
};
export type LanesOrderedNavigationSlot = SlotRegistry<NavPlugin>;

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
  const plugins = navigationSlot.toArray().sort(sortFn);

  return (
    <nav className={styles.navigation}>
      {plugins.map(([id, menuItem]) => (
        <TopBarNav key={id} {...menuItem.props} />
      ))}
    </nav>
  );
}

function sortFn([, { order: first }]: [string, NavPlugin], [, { order: second }]: [string, NavPlugin]) {
  // 0  - equal
  // <0 - first < second
  // >0 - first > second

  return (first ?? 0) - (second ?? 0);
}

function TopBarNav(props: NavLinkProps) {
  const { url } = useRouteMatch();
  const { search } = useLocation(); // sticky query params
  const { href } = props;

  const target = `${extendPath(url, href)}${search}`;

  return (
    <NavLink
      {...props}
      className={classnames(props.className, styles.topBarLink)}
      activeClassName={classnames(props.className, styles.active)}
      href={target}
    >
      <div>{props.children}</div>
    </NavLink>
  );
}
