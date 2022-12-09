import React, { useContext, useMemo } from 'react';
import classnames from 'classnames';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { CollapsableMenuNav, ComponentContext, NavPlugin, TopBarNav, useComponent } from '@teambit/component';
import { ComponentCompareContext } from '@teambit/component.ui.component-compare.context';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import { ComponentCompareBlankState } from '@teambit/component.ui.component-compare.blank-state';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import { useLocation } from '@teambit/base-react.navigation.link';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { ComponentCompareProps, TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { groupByVersion } from '@teambit/component.ui.component-compare.utils.group-by-version';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import { sortByDateDsc } from '@teambit/component.ui.component-compare.utils.sort-logs';
import { extractLazyLoadedData } from '@teambit/component.ui.component-compare.utils.lazy-loading';

import styles from './component-compare.module.scss';

const findPrevVersionFromCurrent = (compareVersion) => (_, index: number, logs: LegacyComponentLog[]) => {
  if (compareVersion === 'workspace' || logs.length === 1) return true;

  if (index === 0) return false;

  const prevIndex = index - 1;

  return logs[prevIndex].tag === compareVersion || logs[prevIndex].hash === compareVersion;
};

export function ComponentCompare(props: ComponentCompareProps) {
  const {
    host,
    baseId: _baseId,
    compareId: _compareId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    routes,
    state,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tabs,
    className,
    hooks,
    customUseComponent,
    ...rest
  } = props;
  const baseVersion = useCompareQueryParam('baseVersion');
  const component = useContext(ComponentContext);
  const location = useLocation();
  const isWorkspace = host === 'teambit.workspace/workspace';
  const allVersionInfo = useMemo(() => component.logs?.slice().sort(sortByDateDsc) || [], [component.id.toString()]);
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

  const { component: base, loading: loadingBase } = useComponent(host, baseId.toString(), { customUseComponent });
  const { component: compareComponent, loading: loadingCompare } = useComponent(host, _compareId?.toString() || '', {
    skip: !_compareId,
    customUseComponent,
  });

  const loading = loadingBase || loadingCompare;

  const compare = _compareId ? compareComponent : component;

  const isEmpty = !loading && !compareIsLocalChanges && !compare && !base;

  const logsByVersion = useMemo(() => {
    return (compare?.logs || []).slice().reduce(groupByVersion, new Map<string, LegacyComponentLog>());
  }, [compare?.id.toString()]);

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
        {isEmpty && <ComponentCompareBlankState />}
        {!loading && !isEmpty && <RenderCompareScreen {...props} />}
      </div>
    </ComponentCompareContext.Provider>
  );
}

function RenderCompareScreen(props: ComponentCompareProps) {
  const { routes, state } = props;

  return (
    <>
      {(state?.versionPicker?.element === undefined || !!state.versionPicker.element) && (
        <div className={styles.top}>
          {(!state?.versionPicker && <ComponentCompareVersionPicker />) || state?.versionPicker?.element}
        </div>
      )}
      <div className={styles.bottom}>
        <CompareMenuNav {...props} />
        {(extractLazyLoadedData(routes) || []).length > 0 && (
          <SlotRouter routes={extractLazyLoadedData(routes) || []} />
        )}
        {state?.tabs?.element}
      </div>
    </>
  );
}

function CompareMenuNav({ tabs, state, hooks }: ComponentCompareProps) {
  const activeTab = state?.tabs?.id;
  const isControlled = state?.tabs?.controlled;
  const extractedTabs: [string, NavPlugin & TabItem][] = (extractLazyLoadedData(tabs) || [])
    .sort(sortTabs)
    .map((tab, index) => {
      const isActive = !state ? undefined : !!activeTab && !!tab?.id && activeTab === tab.id;
      return [
        tab.id || `tab-${index}`,
        {
          ...tab,
          widget: tab.widget || typeof tab.props?.children !== 'string',
          props: {
            ...(tab.props || {}),
            displayName: tab.displayName,
            active: isActive,
            onClick: onNavClicked({ id: tab.id, hooks }),
            href: (!isControlled && tab.props?.href) || undefined,
            activeClassName: styles.activeNav,
            className: styles.navItem,
          },
        },
      ];
    });
  const sortedTabs = extractedTabs.filter(([, tab]) => !tab.widget);
  const sortedWidgets = extractedTabs.filter(([, tab]) => tab.widget);

  return (
    <div className={styles.navContainer}>
      {/* <nav className={styles.navigation}>
        {sortedTabs.map((tabItem, index) => {
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
      </nav> */}
      <CollapsableMenuNav navPlugins={sortedTabs} widgetPlugins={sortedWidgets} />
    </div>
  );
}

function onNavClicked({ hooks, id }: { hooks?: ComponentCompareHooks; id?: string }) {
  if (!hooks?.tabs?.onClick) return undefined;
  return (e) => hooks?.tabs?.onClick?.(id, e);
}
