import React, { useMemo } from 'react';
import classNames from 'classnames';
import { TabsLink } from '@teambit/design.navigation.tabs';
import { useLocation } from '@teambit/base-react.navigation.link';
import { compareUrl } from '@teambit/base-ui.routing.compare-url';
// import { TopBarNav } from '../top-bar-nav';
import styles from './menu.module.scss';
import { NavPlugin, OrderedNavigationSlot } from './nav-plugin';

export type MenuNavProps = {
  navigationSlot: OrderedNavigationSlot;
} & React.HTMLAttributes<HTMLElement>;

export function MenuNav({ navigationSlot, className }: MenuNavProps) {
  const plugins = useMemo(() => navigationSlot.toArray().sort(sortFn), [navigationSlot]);
  const location = useLocation();

  const getFullPath = (href: string) => {
    if (location) {
      if (href === '.') return location.pathname;
      const tildeIndex = location.pathname.indexOf('~');
      return tildeIndex === -1 ? location.pathname + href : location.pathname.substring(0, tildeIndex) + href;
    }
    return href;
  };

  const links = plugins.map(([id, menuItem]) => {
    const path = getFullPath(menuItem.props.href || '');
    const isActive = compareUrl(
      location?.pathname,
      menuItem.props.href === '.' ? location.pathname : menuItem.props.href
    );
    console.log('isActive', isActive);
    console.log(menuItem.props.href);
    return {
      ...menuItem.props,
      key: id,
      // href: path,
      active: isActive,
    };
  });

  //console.log('links', links);

  return <TabsLink links={links} className={classNames(styles.newNavigation, className)} />;

  // return (
  //   <nav className={classnames(styles.navigation, styles.desktopNav, className)}>
  //     {plugins.map(([id, menuItem]) => {
  //       return <TopBarNav key={id} {...menuItem.props} />;
  //     })}
  //   </nav>
  // );
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
