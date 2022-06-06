import { ComponentContext, TopBarNav, useComponent } from '@teambit/component';
import { ComponentCompareNav, ComponentCompareNavSlot } from '@teambit/component-compare';
import { H2 } from '@teambit/documenter.ui.heading';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import flatten from 'lodash.flatten';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import React, { HTMLAttributes, useContext, useMemo } from 'react';
import { ComponentCompareContext, ComponentCompareModel } from './component-compare-context';
import { ComponentCompareVersionPicker } from './version-picker/component-compare-version-picker';
import { useCompareQueryParam } from './use-component-compare-query';
import styles from './component-compare.module.scss';

export type ComponentCompareProps = {
  navSlot: ComponentCompareNavSlot;
  routeSlot: RouteSlot;
  host: string;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompare({ navSlot, host, routeSlot }: ComponentCompareProps) {
  const baseVersion = useCompareQueryParam('baseVersion');
  const component = useContext(ComponentContext);
  const location = useLocation();

  const isWorkspace = host === 'teambit.workspace/workspace';
  
  const allVersionInfo = component.logs?.slice().reverse() || [];
  const isNew = allVersionInfo.length === 0;
  const compareVersion =
    isWorkspace && !isNew && !location.search.includes('version') ? 'workspace' : component.id.version;
  const compareIsLocalChanges = compareVersion === 'workspace';

  const lastVersionInfo = useMemo(() => {
    const findPrevVersionFromCurrent = (_, index: number, logs: LegacyComponentLog[]) => {
      if (index === 0) return false;
      if (logs.length === 1) return true;

      const prevIndex = index - 1;

      return logs[prevIndex].tag === compareVersion || logs[prevIndex].hash === compareVersion;
    };

    const prevVersionInfo = allVersionInfo.find(findPrevVersionFromCurrent);

    return prevVersionInfo;
  }, [component.logs]);

  const baseId =
    (baseVersion && component.id.changeVersion(baseVersion)) ||
    (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
    component.id;

  const compare = component;

  const { component: base, loading } = useComponent(host, baseId.toString());

  const componentCompareModel: ComponentCompareModel = {
    compare,
    base,
    loading,
    compareIsLocalChanges,
  };

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={styles.componentCompareContainer}>
        {loading && (
          <div className={styles.loader}>
            <RoundLoader />
          </div>
        )}
        {loading || (
          <>
            <div className={styles.top}>
              <H2 size="xs">Component Compare</H2>
              {loading || <ComponentCompareVersionPicker />}
            </div>
            <div className={styles.bottom}>
              <CompareMenuNav navSlot={navSlot} />
              <SlotRouter slot={routeSlot} />
            </div>
          </>
        )}
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
