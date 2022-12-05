import React, { useMemo } from 'react';
import classnames from 'classnames';
import { ResponsiveNavbar } from '@teambit/design.navigation.responsive-navbar';
import type { TabProps } from '@teambit/design.navigation.responsive-navbar';
import { TopBarNav } from '../top-bar-nav';
import styles from './menu.module.scss';
import { NavPlugin, OrderedNavigationSlot } from './nav-plugin';

export type MenuNavProps = {
  navigationSlot: OrderedNavigationSlot;
  widgetSlot: OrderedNavigationSlot;
} & React.HTMLAttributes<HTMLElement>;

export function CollapsableMenuNav({ navigationSlot, widgetSlot, className }: MenuNavProps) {
  const plugins = useMemo(() => navigationSlot.toArray().sort(sortFn), [navigationSlot]);
  const widgets = useMemo(() => widgetSlot.toArray().sort(sortFn), [widgetSlot]);

  const links = [...plugins, ...widgets].map(([id, menuItem]) => {

    // these styles keep plugins to the left and widgets to the right.
    const lastPluginStyle = menuItem.props.href === plugins[-1]?.[1].props.href ? { marginRight: 'auto' } : {};
    const firstWidgetStyle = menuItem.props.href === widgets[0]?.[1].props.href ? { marginLeft: 'auto' } : {};

    return {
      component: function TopBarNavComponent({ isInMenu }: TabProps) {
        const widgetDisplayText = (menuItem.props.displayName && isInMenu) && menuItem.props.displayName;
        return (
          <TopBarNav className={classnames(styles.topBarNav, isInMenu && styles.noBorder)} key={id} {...menuItem.props}>
            {widgetDisplayText || menuItem.props.children}
          </TopBarNav>
        );
      },
      style: { ...firstWidgetStyle, ...lastPluginStyle },
    };
  });
  return (
    <ResponsiveNavbar
      navClassName={classnames(styles.tab, className)}
      style={{ width: '100%', height: '100%' }}
      priority="none"
      tabs={links}
    />
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
