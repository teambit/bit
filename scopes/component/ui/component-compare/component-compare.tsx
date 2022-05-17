import { NavLink, NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { ComponentContext, useComponent } from '@teambit/component';
import { ComponentCompareNav, ComponentCompareNavSlot } from '@teambit/component-compare';
import { H2 } from '@teambit/documenter.ui.heading';
import { extendPath } from '@teambit/ui-foundation.ui.react-router.extend-path';
import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import classNames from 'classnames';
import flatten from 'lodash.flatten';
import React, { HTMLAttributes, useContext, useMemo } from 'react';
import { useLocation, useRouteMatch } from 'react-router-dom';
import { ComponentCompareContext, ComponentCompareModel } from './component-compare-context';
import { ComponentCompareVersionPicker } from './component-compare-version-picker/component-compare-version-picker';
import styles from './component-compare.module.scss';
import { useComponentCompareParams } from './use-component-compare-params';

export type ComponentCompareProps = {
  navSlot: ComponentCompareNavSlot;
  routeSlot: RouteSlot;
  host: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompare({ navSlot, host, routeSlot }: ComponentCompareProps) {
  const { baseVersion } = useComponentCompareParams();
  const component = useContext(ComponentContext);
  const [, lastVersionInfo] = useMemo(() => {
    return component.logs?.slice().reverse() || [] || [];
  }, [component.logs]);

  const baseId =
    (baseVersion && component.id.changeVersion(baseVersion)) ||
    (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
    component.id;

  // const compareId = component.id;

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
          <SlotSubRouter slot={routeSlot} />
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
