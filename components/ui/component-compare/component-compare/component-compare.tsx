import React, { HTMLAttributes, useContext, useMemo } from 'react';
import { RouteProps } from 'react-router-dom';
import { isFunction } from 'lodash';
import classnames from 'classnames';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { ComponentContext, ComponentID, TopBarNav, useComponent } from '@teambit/component';
import { ComponentCompareContext } from '@teambit/component.ui.component-compare.context';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import { ComponentCompareBlankState } from '@teambit/component.ui.component-compare.blank-state';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { useLocation } from '@teambit/base-react.navigation.link';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';

import styles from './component-compare.module.scss';

export type TabItem = {
  id?: string;
  props?: NavLinkProps;
  order: number;
  element?: React.ReactNode | null;
};

export type MaybeLazyLoaded<T> = T | (() => T);
export function extractLazyLoadedData<T>(data?: MaybeLazyLoaded<T>): T | undefined {
  if (isFunction(data)) return data();
  return data;
}

export type ComponentCompareProps = {
  state?: ComponentCompareState;
  hooks?: ComponentCompareHooks;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  routes?: MaybeLazyLoaded<RouteProps[]>;
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

export function ComponentCompare(props: ComponentCompareProps) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { host, baseId: _baseId, compareId: _compareId, routes, state, tabs, className, hooks, ...rest } = props;
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

  const nothingToCompare = !loading && !compareIsLocalChanges && !compare && !base;

  const visible = !loading && !nothingToCompare;

  const logsByVersion = useMemo(() => {
    return (compare?.logs || []).slice().reduce(groupByVersion, new Map<string, LegacyComponentLog>());
  }, [compare?.id, baseId]);

  const componentCompareModel = {
    compare: compare && {
      model: compare,
      hasLocalChanges: compareIsLocalChanges,
    },
    base: base && {
      model: base,
    },
    loading,
    logsByVersion,
    state,
    hooks,
  };

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={classnames(styles.componentCompareContainer, className)} {...rest}>
        {loading && (
          <div className={styles.loader}>
            <RoundLoader />
          </div>
        )}
        {visible && <RenderCompareScreen {...props} />}
        {nothingToCompare && <ComponentCompareBlankState />}
      </div>
    </ComponentCompareContext.Provider>
  );
}

function RenderCompareScreen(props: ComponentCompareProps) {
  const { routes, state } = props;
  return (
    <>
      <div className={styles.top}>
        {(!state?.versionPicker && <ComponentCompareVersionPicker />) || state?.versionPicker?.element}
      </div>
      <div className={styles.bottom}>
        <CompareMenuNav {...props} />
        {(extractLazyLoadedData(routes) || []).length > 0 && (
          <SlotRouter routes={extractLazyLoadedData(routes) || []} />
        )}
        {state?.tabs && state.tabs.element}
      </div>
    </>
  );
}

function CompareMenuNav({ tabs, state, hooks }: ComponentCompareProps) {
  const sortedTabs = (extractLazyLoadedData(tabs) || []).sort(sortTabs);

  const activeTabFromState = state?.tabs?.id;
  const isControlled = state?.tabs?.controlled;

  return (
    <div className={styles.navContainer}>
      <nav className={styles.navigation}>
        {sortedTabs.map((tabItem, index) => {
          const isActive = !state
            ? undefined
            : !!activeTabFromState && !!tabItem.id && activeTabFromState === tabItem.id;

          return (
            <TopBarNav
              {...(tabItem.props || {})}
              key={`compare-menu-nav-${index}-${tabItem.id}`}
              active={isActive}
              onClick={onNavClicked({ id: tabItem.id, hooks })}
              href={(!isControlled && tabItem.props?.href) || undefined}
            />
          );
        })}
      </nav>
    </div>
  );
}

function onNavClicked({ hooks, id }: { hooks?: ComponentCompareHooks; id?: string }) {
  if (!hooks?.tabs?.onClick) return undefined;
  return (e) => hooks?.tabs?.onClick?.(id, e);
}

export function sortTabs({ order: first }: TabItem, { order: second }: TabItem) {
  return (first ?? 0) - (second ?? 0);
}
