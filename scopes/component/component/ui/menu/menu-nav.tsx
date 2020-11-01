import React from 'react';

import { TopBarNav } from '../top-bar-nav';
import styles from './menu.module.scss';
import { NavPlugin, OrderedNavigationSlot } from './nav-plugin';

export function MenuNav({ navigationSlot }: { navigationSlot: OrderedNavigationSlot }) {
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
