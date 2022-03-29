import React, {useMemo} from 'react';
import { Switch, Route, useRouteMatch } from 'react-router-dom';
import classnames from 'classnames';
import { Icon } from '@teambit/design.elements.icon';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { extendPath } from '@teambit/ui-foundation.ui.react-router.extend-path';
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
  const { url } = useRouteMatch();
  const plugins = navigationSlot.toArray().sort(sortFn);
  const widgets = widgetSlot.toArray().sort(sortFn);
  const totalSlots = useMemo(() => [...plugins, ...widgets], [plugins, widgets]);

  return (
    <Dropdown
      placeholder=""
      PlaceholderComponent={() => <Placeholder slots={totalSlots} baseUrl={url} />}
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
              {typeof menuItem.props.children === 'string' ? menuItem.props.children : menuItem.props.simpleText}
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

function Placeholder({ slots, baseUrl, ...rest }) {
  return (
    <div {...rest} className={mobileStyles.placeholder}>
      <Switch>
        {slots.map(([id, menuItem]) => {
          const path = extendPath(baseUrl, menuItem?.props?.href);
          return (
            <Route exact path={path}>
              {typeof menuItem?.props?.children === 'string' ? menuItem?.props?.children : menuItem?.props?.simpleText}
            </Route>
          );
        })}
      </Switch>
      <Icon of="fat-arrow-down" />
    </div>
  );
}
