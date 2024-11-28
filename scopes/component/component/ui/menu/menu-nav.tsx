import React, { useMemo } from 'react';
import classnames from 'classnames';
import { ResponsiveNavbar } from '@teambit/design.navigation.responsive-navbar';
import type { TabProps } from '@teambit/design.navigation.responsive-navbar';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { TopBarNav } from '../top-bar-nav';
import styles from './menu.module.scss';
import { NavPlugin, OrderedNavigationSlot } from './nav-plugin';

export type MenuNavProps = {
  /**
   * @deprecated
   * use @property navPlugins
   */
  navigationSlot?: OrderedNavigationSlot;
  /**
   * @deprecated
   * use @property widgetPlugins
   */
  widgetSlot?: OrderedNavigationSlot;
  navPlugins?: [string, NavPlugin][];
  widgetPlugins?: [string, NavPlugin][];
  /**
   * A className to pass to the secondary nav, i.e dropdown
   */
  secondaryNavClassName?: string;
  activeTabIndex?: number;
  alwaysShowActiveTab?: boolean;
} & React.HTMLAttributes<HTMLElement>;

function TopBarNavComponent({ isInMenu, menuItemProps }: TabProps) {
  /**
   * to accommodate for the top level nav which should display the children
   * in the dropdown secondary menu if there is a displayName set
   */
  const widgetDisplayText = menuItemProps?.displayName && isInMenu ? menuItemProps?.displayName : undefined;
  return (
    <TopBarNav
      {...menuItemProps}
      className={classnames(menuItemProps?.className, styles.topBarNav, isInMenu && styles.noBorder)}
    >
      {widgetDisplayText || menuItemProps?.children}
    </TopBarNav>
  );
}

export function CollapsibleMenuNav({
  navigationSlot,
  widgetSlot,
  navPlugins = [],
  widgetPlugins = [],
  className,
  secondaryNavClassName,
  activeTabIndex,
  alwaysShowActiveTab,
  children,
}: MenuNavProps) {
  const { isMinimal } = useWorkspaceMode();
  const plugins = useMemo(() => {
    const _navPlugins = navPlugins.length > 0 ? navPlugins : navigationSlot?.toArray();
    if (!isMinimal) {
      return (_navPlugins || []).sort(sortFn);
    }
    return (_navPlugins || []).filter((widget) => !widget[1].props.hideInMinimalMode).sort(sortFn);
  }, [navigationSlot, navPlugins, isMinimal]);

  const widgets = useMemo(() => {
    const _widgetPlugins = widgetPlugins.length > 0 ? widgetPlugins : widgetSlot?.toArray();
    if (!isMinimal) {
      return (_widgetPlugins || []).sort(sortFn);
    }
    return (_widgetPlugins || []).filter((widget) => !widget[1].props.hideInMinimalMode).sort(sortFn);
  }, [widgetSlot, widgetPlugins, isMinimal]);

  const links = [...plugins, ...widgets].map(([, menuItem], index) => {
    // these styles keep plugins to the left and widgets to the right.
    const lastPluginStyle = plugins.length - 1 === index ? { marginRight: 'auto' } : {};

    const firstWidgetStyle = plugins.length === index ? { marginLeft: 'auto' } : {};

    return {
      component: TopBarNavComponent,
      tabProps: {
        menuItemProps: menuItem.props,
      },
      style: { ...firstWidgetStyle, ...lastPluginStyle },
      className: menuItem.props.className,
    };
  });

  return (
    <ResponsiveNavbar
      navClassName={classnames(styles.tab, className)}
      secondaryNavClassName={secondaryNavClassName}
      style={{ width: '100%', height: '100%' }}
      priority="none"
      tabs={links}
      defaultActiveIndex={activeTabIndex}
      alwaysShowActiveTab={alwaysShowActiveTab}
    >
      {children}
    </ResponsiveNavbar>
  );
}

function sortFn([, { order: first }]: [string, NavPlugin], [, { order: second }]: [string, NavPlugin]) {
  // 0  - equal
  // <0 - first < second
  // >0 - first > second

  return (first ?? 0) - (second ?? 0);
}

// // this is the aspect-oriented and serialize-able way to sort plugins.
// const pluginOrder = ['teambit.docs/docs', 'teambit.compositions/compositions', 'teambit.docs/docs'];
// export function toSortedArray<T>(slot: SlotRegistry<T>, order: string[]) {
//   // sort items according to the order
//   const sorted = order.map((x) => [x, slot.get(x)]).filter(([, val]) => !!val) as [string, T][];
//
//   // add all other items
//   const unsorted = slot.toArray().filter(([id]) => order.indexOf(id) < 0);
//
//   return sorted.concat(unsorted);
// }
