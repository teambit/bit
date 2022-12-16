import React, { useContext, useMemo } from 'react';
import classnames from 'classnames';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { CollapsibleMenuNav, ComponentContext, ComponentID, NavPlugin, useComponent } from '@teambit/component';
import { ComponentCompareContext } from '@teambit/component.ui.component-compare.context';
import { useComponentCompareQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare';
import { FileCompareResult } from '@teambit/component.ui.component-compare.models.component-compare-model';
import { FieldCompareResult } from '@teambit/component.ui.component-compare.models.component-compare-model/component-compare-model';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import { ComponentCompareBlankState } from '@teambit/component.ui.component-compare.blank-state';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { useLocation } from '@teambit/base-react.navigation.link';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { ComponentCompareProps, TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { groupByVersion } from '@teambit/component.ui.component-compare.utils.group-by-version';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import { sortByDateDsc } from '@teambit/component.ui.component-compare.utils.sort-logs';
import { extractLazyLoadedData } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { ChangeType } from '@teambit/dot-lanes.entities.lane-diff';

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
    changeType: changeTypeFromProps,
    customUseComponent,
    Loader = CompareLoader,
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

  const { loading: compCompareLoading, componentCompareData } = useComponentCompareQuery(
    base?.id.toString(),
    compare?.id.toString()
  );

  const fileCompareDataByName = useMemo(() => {
    if (loading || compCompareLoading) return undefined;
    if (!compCompareLoading && !componentCompareData) return null;

    const _fileCompareDataByName = new Map<string, FileCompareResult>();
    (componentCompareData?.code || []).forEach((codeCompareData) => {
      _fileCompareDataByName.set(codeCompareData.fileName, codeCompareData);
    });
    return _fileCompareDataByName;
  }, [compCompareLoading, loading]);

  const fieldCompareDataByName = useMemo(() => {
    if (loading || compCompareLoading) return undefined;
    if (!compCompareLoading && !componentCompareData) return null;
    const _fieldCompareDataByName = new Map<string, FieldCompareResult>();
    (componentCompareData?.aspects || []).forEach((aspectCompareData) => {
      _fieldCompareDataByName.set(aspectCompareData.fieldName, aspectCompareData);
    });
    return _fieldCompareDataByName;
  }, [compCompareLoading, loading]);

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
    fieldCompareDataByName,
    fileCompareDataByName,
  };

  const changeType =
    changeTypeFromProps || deriveChangeType(baseId, compare?.id, fileCompareDataByName, fieldCompareDataByName);

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={classnames(styles.componentCompareContainer, className)} {...rest}>
        <Loader className={styles.loader} loading={loading} />
        {isEmpty && <ComponentCompareBlankState />}
        {!loading && !isEmpty && <RenderCompareScreen {...props} changeType={changeType} />}
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

function CompareMenuNav({ tabs, state, hooks, changeType }: ComponentCompareProps) {
  const activeTab = state?.tabs?.id;
  const isControlled = state?.tabs?.controlled;
  const _tabs = extractLazyLoadedData(tabs) || [];

  const extractedTabs: [string, NavPlugin & TabItem][] = useMemo(
    () =>
      _tabs.sort(sortTabs).map((tab, index) => {
        const isActive = !state ? undefined : !!activeTab && !!tab?.id && activeTab === tab.id;
        const changeTypeCss = deriveChangeTypeCssForNav(tab, changeType);

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
              className: classnames(styles.navItem, changeTypeCss),
            },
          },
        ];
      }),
    [_tabs.length, activeTab, changeType]
  );

  const sortedTabs = useMemo(
    () => extractedTabs.filter(([, tab]) => !tab.widget),
    [extractedTabs.length, activeTab, changeType]
  );
  const sortedWidgets = useMemo(
    () => extractedTabs.filter(([, tab]) => tab.widget),
    [extractedTabs.length, activeTab, changeType]
  );

  return (
    <div className={styles.navContainer}>
      <CollapsibleMenuNav navPlugins={sortedTabs} widgetPlugins={sortedWidgets} />
    </div>
  );
}

function onNavClicked({ hooks, id }: { hooks?: ComponentCompareHooks; id?: string }) {
  if (!hooks?.tabs?.onClick) return undefined;
  return (e) => hooks?.tabs?.onClick?.(id, e);
}

function CompareLoader({ loading, className, ...rest }: { loading?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  if (!loading) return null;
  return (
    <div className={className} {...rest}>
      <BlockSkeleton className={styles.navLoader} lines={3} />
      <div className={styles.compareLoader}>
        <div className={styles.compareViewLoader}>
          <BlockSkeleton lines={30} />
        </div>
        <div className={styles.compareSidebarLoader}>
          <BlockSkeleton lines={30} />
        </div>
      </div>
    </div>
  );
}
function deriveChangeType(
  baseId?: ComponentID,
  compareId?: ComponentID,
  fileCompareDataByName?: Map<string, FileCompareResult> | null,
  fieldCompareDataByName?: Map<string, FieldCompareResult> | null
): ChangeType | undefined | null {
  if (!baseId && !compareId) return null;
  if (!baseId?.version) return ChangeType.NEW;

  if (fileCompareDataByName === null || fieldCompareDataByName === null) return null;
  if (fileCompareDataByName === undefined || fieldCompareDataByName === undefined) return undefined;

  if (fileCompareDataByName.size > 0 && [...fileCompareDataByName.values()].some((f) => f.status !== 'UNCHANGED')) {
    return ChangeType.SOURCE_CODE;
  }
  if (fieldCompareDataByName.size === 0) return ChangeType.NONE;

  const depsFields = ['dependencies', 'devDependencies', 'extensionDependencies'];
  if ([...fieldCompareDataByName.values()].some((field) => depsFields.includes(field.fieldName))) {
    return ChangeType.DEPENDENCY;
  }

  return ChangeType.ASPECTS;
}
function deriveChangeTypeCssForNav(tab: TabItem, changeType: ChangeType | null | undefined): string | null {
  if (changeType === null) return null;
  if (changeType === undefined) return styles.changeTypeLoading;

  switch (changeType) {
    case ChangeType.ASPECTS:
      return !tab.id?.toLowerCase().includes('aspects') && styles.aspects;
    case ChangeType.SOURCE_CODE:
      return !tab.id?.toLowerCase().includes('code') && styles.code;
    case ChangeType.DEPENDENCY:
      return !tab.id?.toLowerCase().includes('dependencies') && styles.dependency;
    case ChangeType.NEW:
      return styles.new;
    default:
      return null;
  }
}
