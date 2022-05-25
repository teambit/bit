import { ComponentContext, TopBarNav, useComponent } from '@teambit/component';
import { ComponentCompareNav, ComponentCompareNavSlot } from '@teambit/component-compare';
import { H2 } from '@teambit/documenter.ui.heading';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import flatten from 'lodash.flatten';
import React, { HTMLAttributes, useContext, useMemo } from 'react';
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
  const { baseVersion, parentPath } = useComponentCompareParams();
  const component = useContext(ComponentContext);

  const [lastVersionInfo] = useMemo(() => {
    return component.logs?.slice().reverse() || [] || [];
  }, [component.logs]);

  const baseId =
    (baseVersion && component.id.changeVersion(baseVersion)) ||
    (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
    component.id;

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
        <div className={styles.top}>
          <H2 size="xs">Component Compare</H2>
          <ComponentCompareVersionPicker host={host} />
        </div>
        <div className={styles.bottom}>
          <CompareMenuNav navSlot={navSlot} />
          <SlotRouter slot={routeSlot} parentPath={`${parentPath}*`} />
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
    <div className={styles.navContainer}>
      <nav className={styles.navigation}>
        {plugins.map((menuItem, index) => {
          return <TopBarNav key={`${menuItem.id}-${index}`} {...menuItem.props} />;
        })}
      </nav>
    </div>
  );
}

function sortFn({ order: first }: ComponentCompareNav, { order: second }: ComponentCompareNav) {
  return (first ?? 0) - (second ?? 0);
}
