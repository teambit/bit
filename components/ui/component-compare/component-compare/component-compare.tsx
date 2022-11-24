import { ComponentContext, ComponentID, TopBarNav, useComponent } from '@teambit/component';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { RouteProps } from 'react-router-dom';
import { useLocation } from '@teambit/base-react.navigation.link';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import React, { HTMLAttributes, useContext, useMemo } from 'react';
import { ComponentCompareContext, ComponentCompareModel } from '@teambit/component.ui.component-compare.context';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import { ComponentCompareBlankState } from '@teambit/component.ui.component-compare.blank-state';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { isFunction } from 'lodash';

import styles from './component-compare.module.scss';

export type TabItem = {
  props: NavLinkProps;
  order: number;
};

type MaybeLazyLoaded<T> = T | (() => T);
function extractLazyLoadedData<T>(data: MaybeLazyLoaded<T>): T {
  if (isFunction(data)) return data();
  return data;
}

export type ComponentCompareProps = {
  tabs: MaybeLazyLoaded<TabItem[]>;
  routes: MaybeLazyLoaded<RouteProps[]>;
  host: string;
  baseId?: ComponentID;
  compareId?: ComponentID;
} & HTMLAttributes<HTMLDivElement>;

const findPrevVersionFromCurrent = (compareVersion) => (_, index: number, logs: LegacyComponentLog[]) => {
  if (index === 0) return false;
  if (logs.length === 1) return true;

  const prevIndex = index - 1;

  return logs[prevIndex].tag === compareVersion || logs[prevIndex].hash === compareVersion;
};

const groupByVersion = (accum: Map<string, LegacyComponentLog>, current: LegacyComponentLog) => {
  if (!accum.has(current.tag || current.hash)) {
    accum.set(current.tag || current.hash, current);
  }
  return accum;
};

export function ComponentCompare({
  tabs,
  host,
  routes,
  baseId: _baseId,
  compareId: _compareId,
}: ComponentCompareProps) {
  const baseVersion = useCompareQueryParam('baseVersion');
  const component = useContext(ComponentContext);
  const location = useLocation();

  const isWorkspace = host === 'teambit.workspace/workspace';
  const allVersionInfo = component.logs?.slice() || [];
  const isNew = allVersionInfo.length === 0;
  const compareVersion =
    isWorkspace && !isNew && !location?.search.includes('version') ? 'workspace' : component.id.version;
  const compareIsLocalChanges = compareVersion === 'workspace';

  const lastVersionInfo = useMemo(() => {
    const prevVersionInfo = allVersionInfo.find(findPrevVersionFromCurrent(compareVersion));
    return prevVersionInfo;
  }, [component.logs]);

  const baseId =
    _baseId ||
    (baseVersion && component.id.changeVersion(baseVersion)) ||
    (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
    component.id;

  const { component: base, loading: loadingBase } = useComponent(host, baseId.toString());
  const { component: compareComponent, loading: loadingCompare } = useComponent(host, _compareId?.toString() || '', {
    skip: !_compareId,
  });

  const loading = loadingBase || loadingCompare;

  const compare = _compareId ? compareComponent : component;

  const nothingToCompare = !loading && !compareIsLocalChanges && (compare?.logs?.length || []) < 2;
  const showSubMenus = !loading && !nothingToCompare;

  const logsByVersion = useMemo(() => {
    return (compare?.logs || []).slice().reduce(groupByVersion, new Map<string, LegacyComponentLog>());
  }, [compare?.id, baseId]);

  const componentCompareModel: ComponentCompareModel = {
    compare: compare && {
      model: compare,
      hasLocalChanges: compareIsLocalChanges,
    },
    base: base && {
      model: base,
    },
    loading,
    logsByVersion,
  };

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={styles.componentCompareContainer}>
        {loading && (
          <div className={styles.loader}>
            <RoundLoader />
          </div>
        )}
        {showSubMenus && (
          <>
            <div className={styles.top}>
              <ComponentCompareVersionPicker />
            </div>
            <div className={styles.bottom}>
              <CompareMenuNav tabs={extractLazyLoadedData(tabs)} />
              <SlotRouter routes={extractLazyLoadedData(routes)} />
            </div>
          </>
        )}
        {nothingToCompare && <ComponentCompareBlankState />}
      </div>
    </ComponentCompareContext.Provider>
  );
}

function CompareMenuNav({ tabs }: { tabs: TabItem[] }) {
  const sortedTabs = tabs.sort(sortFn);

  return (
    <div className={styles.navContainer}>
      <nav className={styles.navigation}>
        {sortedTabs.map((tabItem, index) => {
          return <TopBarNav key={`compare-menu-nav-${index}`} {...tabItem.props} />;
        })}
      </nav>
    </div>
  );
}

function sortFn({ order: first }: TabItem, { order: second }: TabItem) {
  return (first ?? 0) - (second ?? 0);
}
