import React, { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import classnames from 'classnames';
import { Icon } from '@teambit/design.elements.icon';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { TopBarNav } from '../top-bar-nav';
import styles from './menu.module.scss';
import mobileStyles from './mobile-menu-nav.module.scss';
import { NavPlugin, OrderedNavigationSlot } from './nav-plugin';

export function MobileMenuNav({
  navigationSlot,
  widgetSlot,
  className,
}: {
  navigationSlot: OrderedNavigationSlot;
  widgetSlot: OrderedNavigationSlot;
  className?: string;
}) {
  const totalSlots = useMemo(
    () => [...navigationSlot.toArray().sort(sortFn), ...widgetSlot.toArray().sort(sortFn)],
    [navigationSlot, widgetSlot]
  );

  return (
    <Dropdown
      // @ts-ignore - mismatch between @types/react
      placeholder={<Placeholder slots={totalSlots} />}
      className={classnames(styles.navigation, styles.mobileNav, className)}
      dropClass={mobileStyles.mobileMenu}
    >
      <nav>
        <Icon of="x-thick" className={mobileStyles.close} />
        {totalSlots.map(([id, menuItem]) => {
          return (
            <TopBarNav
              key={id}
              {...menuItem.props}
              className={mobileStyles.mobileMenuLink}
              activeClassName={mobileStyles.active}
            >
              {typeof menuItem.props.children === 'string' ? menuItem.props.children : menuItem.props.displayName}
            </TopBarNav>
          );
        })}
      </nav>
    </Dropdown>
  );
}

function sortFn([, { order: first }]: [string, NavPlugin], [, { order: second }]: [string, NavPlugin]) {
  // 0  - equal
  // <0 - first < second
  // >0 - first > second

  return (first ?? 0) - (second ?? 0);
}

type PlaceholderProps = {
  slots: [string, NavPlugin][];
  baseUrl?: string;
} & React.HTMLAttributes<HTMLDivElement>;

function Placeholder({ slots, ...rest }: PlaceholderProps) {
  return (
    <div {...rest} className={mobileStyles.placeholder}>
      <Routes>
        {slots?.map(([id, menuItem]) => (
          <Route
            key={id}
            path={menuItem?.props?.href}
            element={
              typeof menuItem?.props?.children === 'string' ? menuItem?.props?.children : menuItem?.props?.displayName
            }
          />
        ))}
      </Routes>
      <Icon of="fat-arrow-down" />
    </div>
  );
}
