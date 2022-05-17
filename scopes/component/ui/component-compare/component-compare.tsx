import React, { HTMLAttributes, useState, useContext, useMemo } from 'react';
import flatten from 'lodash.flatten';
import { ComponentContext, ComponentID, ComponentModel, useComponent } from '@teambit/component';
import classNames from 'classnames';
import { H2 } from '@teambit/documenter.ui.heading';
import { NavLink, NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { extendPath } from '@teambit/ui-foundation.ui.react-router.extend-path';
import { ComponentCompareNavSlot, ComponentCompareNav } from '@teambit/component-compare';
import { useRouteMatch, useLocation } from 'react-router-dom';

import styles from './component-compare.module.scss';
import { useComponentCompareParams } from './use-component-compare-params';
import { ComponentCompareContext, ComponentCompareModel } from './component-compare-context';
import { ComponentCompareVersionPicker } from './component-compare-version-picker/component-compare-version-picker';

export type ComponentCompareProps = {
  navSlot: ComponentCompareNavSlot;
  routeSlot: RouteSlot;
  host: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompare({ navSlot, host, routeSlot }: ComponentCompareProps) {
  const { baseVersion } = useComponentCompareParams();
  const component = useContext(ComponentContext);
  const [currentVersionInfo, lastVersionInfo] = useMemo(() => {
    return component.logs?.slice().reverse() || [] || [];
  }, [component.logs]);

  const baseId =
    (baseVersion && component.id.changeVersion(baseVersion)) ||
    (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
    component.id;

  const compareId = component.id;

  const compare = component;

  const { component: base, loading } = useComponent(host, baseId);

  const componentCompareModel: ComponentCompareModel = {
    compare,
    base: base || compare,
    loading,
  };

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={styles.componentCompareContainer}>
        <div className={styles.componentCompareVersionsContainer}>
          <H2>Component Compare</H2>
          <ComponentCompareVersionPicker />
        </div>
        <div className={styles.componentCompareViewerContainer}>
          <CompareMenuNav navSlot={navSlot} />
          <SlotRouter slot={routeSlot} />
        </div>
      </div>
    </ComponentCompareContext.Provider>
  );
}

function CompareMenuNav({ navSlot }: { navSlot: ComponentCompareNavSlot }) {
  const plugins = flatten(
    navSlot.toArray().map(([id, values]) => {
      const flattenedValues = flatten(values).map((value) => ({ ...value, id }));
      return flattenedValues;
    })
  ).sort(sortFn);

  return (
    <nav className={styles.navigation}>
      {plugins.map((menuItem, index) => {
        return <TopBarNav key={`${menuItem.id}-${index}`} {...menuItem.props} />;
      })}
    </nav>
  );
}

function TopBarNav(props: NavLinkProps) {
  const { url } = useRouteMatch();
  const { search, pathname } = useLocation();
  const { href } = props;

  const target = `${extendPath(url, href)}${search}`;

  return (
    <NavLink
      {...props}
      className={classNames(props.className, styles.topBarLink)}
      activeClassName={classNames(props.activeClassName, target === pathname && styles.active)}
      href={target}
    >
      <div>{props.children}</div>
    </NavLink>
  );
}

function sortFn({ order: first }: ComponentCompareNav, { order: second }: ComponentCompareNav) {
  return (first ?? 0) - (second ?? 0);
}
