import React, { HTMLAttributes, useState, useContext, useMemo } from 'react';
import flatten from 'lodash.flatten';
import { ComponentContext, ComponentID, ComponentModel, useComponent } from '@teambit/component';
import classNames from 'classnames';
import { H2 } from '@teambit/documenter.ui.heading';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { ComponentCompareNavSlot, ComponentCompareNav } from '@teambit/component-compare';
import styles from './component-compare.module.scss';
import { useComponentCompareParams } from './use-component-compare-params';
import { ComponentCompareContext, ComponentCompareModel } from './component-compare-context';

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

  const compareRoutes = flatten(
    navSlot.toArray().map(([id, values]) => {
      const flattenedValues = flatten(values).map((value) => ({ ...value, id }));
      return flattenedValues;
    })
  ).sort(sortFn);

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
        <div className={styles.componentCompareVersionsContainer}></div>
        <div className={styles.componentCompareViewerContainer}></div>
      </div>
    </ComponentCompareContext.Provider>
  );
}

function sortFn({ order: first }: ComponentCompareRoute, { order: second }: ComponentCompareRoute) {
  // 0  - equal
  // <0 - first < second
  // >0 - first > second
  return (first ?? 0) - (second ?? 0);
}
