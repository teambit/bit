/* eslint-disable react/destructuring-assignment */
/* eslint-disable react/require-default-props */
import React, { useContext, useMemo, HTMLAttributes } from 'react';
import classnames from 'classnames';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import {
  CollapsibleMenuNav,
  ComponentContext,
  ComponentDescriptorContext,
  ComponentID,
  NavPlugin,
  useComponent,
} from '@teambit/component';
import { ComponentCompareContext } from '@teambit/component.ui.component-compare.context';
import { useComponentCompareQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare';
import {
  FileCompareResult,
  FieldCompareResult,
} from '@teambit/component.ui.component-compare.models.component-compare-model';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { useLocation } from '@teambit/base-react.navigation.link';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type {
  ComponentCompareProps,
  TabItem,
} from '@teambit/component.ui.component-compare.models.component-compare-props';
import { groupByVersion } from '@teambit/component.ui.component-compare.utils.group-by-version';
import { sortTabs } from '@teambit/component.ui.component-compare.utils.sort-tabs';
import { sortByDateDsc } from '@teambit/component.ui.component-compare.utils.sort-logs';
import { extractLazyLoadedData } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { BlockSkeleton, WordSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';

import styles from './component-compare.module.scss';

const findPrevVersionFromCurrent = (compareVersion) => (_, index: number, logs: LegacyComponentLog[]) => {
  if (compareVersion === 'workspace' || logs.length === 1) return true;

  if (index === 0) return false;

  const prevIndex = index - 1;

  return logs[prevIndex].tag === compareVersion || logs[prevIndex].hash === compareVersion;
};

function deriveChangeTypeCssForNav(tab: TabItem, changed: ChangeType[] | null | undefined): string | null {
  if (!changed || !tab.changeType) return null;
  const hasChanged = changed.some((change) => tab.changeType === change);
  return hasChanged ? styles.hasChanged : null;
}

function onNavClicked({ hooks, id }: { hooks?: ComponentCompareHooks; id?: string }) {
  if (!hooks?.tabs?.onClick) return undefined;
  return (e) => hooks?.tabs?.onClick?.(id, e);
}

function TabLoader() {
  return <WordSkeleton className={styles.tabLoader} length={5} />;
}

function CompareMenuTab({
  children,
  changed,
  changeTypeCss,
  loading,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  changeTypeCss?: string | null;
  loading?: boolean;
  changed?: ChangeType[] | null;
}) {
  const hasChanged = useMemo(
    () => changed?.some((change) => change !== ChangeType.NONE && change !== ChangeType.NEW),
    [changeTypeCss]
  );

  if (loading) return <TabLoader />;

  return (
    <div {...rest} className={classnames(styles.compareMenuTab, className)}>
      {changeTypeCss && hasChanged && <div className={classnames(styles.indicator, changeTypeCss)} />}
      <div className={classnames(styles.menuTab)}>{children}</div>
    </div>
  );
}

function CompareMenuNav({ tabs, state, hooks, changes: changed }: ComponentCompareProps) {
  const activeTab = state?.tabs?.id;
  const isControlled = state?.tabs?.controlled;
  const tabsFromProps = extractLazyLoadedData(tabs) || [];

  const extractedTabs: [string, NavPlugin & TabItem][] = useMemo(
    () =>
      tabsFromProps.sort(sortTabs).map((tab, index) => {
        const isActive = !state ? undefined : !!activeTab && !!tab?.id && activeTab === tab.id;
        const changeTypeCss = deriveChangeTypeCssForNav(tab, changed);
        const loading = changed === undefined;
        const key = `${tab.id}-tab-${changeTypeCss}`;
        return [
          tab.id || `tab-${index}`,
          {
            ...tab,
            props: {
              ...(tab.props || {}),
              key,
              displayName: (!loading && tab.displayName) || undefined,
              active: isActive,
              onClick: onNavClicked({ id: tab.id, hooks }),
              href: (!isControlled && tab.props?.href) || undefined,
              activeClassName: (!loading && styles.activeNav) || styles.loadingNav,
              className: styles.navItem,
              children: (
                <CompareMenuTab key={key} loading={loading} changeTypeCss={changeTypeCss} changed={changed}>
                  {tab.props?.children}
                </CompareMenuTab>
              ),
            },
          },
        ];
      }),
    [tabsFromProps.length, activeTab, changed, changed?.length]
  );

  const sortedTabs = useMemo(
    () => extractedTabs.filter(([, tab]) => !tab.widget),
    [extractedTabs.length, activeTab, changed?.length, changed]
  );
  const sortedWidgets = useMemo(
    () => extractedTabs.filter(([, tab]) => tab.widget),
    [extractedTabs.length, activeTab, changed?.length, changed]
  );

  return (
    <div className={styles.navContainer}>
      <CollapsibleMenuNav navPlugins={sortedTabs} widgetPlugins={sortedWidgets} />
    </div>
  );
}

function deriveChangeType(
  baseId?: ComponentID,
  compareId?: ComponentID,
  fileCompareDataByName?: Map<string, FileCompareResult> | null,
  fieldCompareDataByName?: Map<string, FieldCompareResult> | null,
  testCompareDataByName?: Map<string, FileCompareResult> | null
): ChangeType[] | undefined | null {
  if (!baseId && !compareId) return null;
  if (!baseId?.version) return [ChangeType.NEW];

  if (fileCompareDataByName === null || fieldCompareDataByName === null) return null;
  if (fileCompareDataByName === undefined || fieldCompareDataByName === undefined) return undefined;

  const fileCompareData = [...fileCompareDataByName.values()];

  if (
    fieldCompareDataByName.size === 0 &&
    (fileCompareDataByName.size === 0 || fileCompareData.every((f) => f.status === 'UNCHANGED'))
  ) {
    return [ChangeType.NONE];
  }

  const changed: ChangeType[] = [];
  const DEPS_FIELD = ['dependencies', 'devDependencies', 'extensionDependencies', 'packageDependencies'];

  if (testCompareDataByName?.size) {
    changed.push(ChangeType.TESTS);
  }

  if (fileCompareDataByName.size > 0 && fileCompareData.some((f) => f.status !== 'UNCHANGED')) {
    changed.push(ChangeType.SOURCE_CODE);
  }

  if (fieldCompareDataByName.size > 0) {
    changed.push(ChangeType.ASPECTS);
  }

  if ([...fieldCompareDataByName.values()].some((field) => DEPS_FIELD.includes(field.fieldName))) {
    changed.push(ChangeType.DEPENDENCY);
  }

  return changed;
}

function CompareLoader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
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

function RenderCompareScreen(
  props: ComponentCompareProps & {
    baseVersion?: string;
    compareVersion?: string;
    compareHasLocalChanges?: boolean;
    componentId: string;
    loading?: boolean;
  }
) {
  const {
    routes,
    state,
    loading,
    Loader = CompareLoader,
    baseVersion,
    compareVersion,
    compareHasLocalChanges,
    componentId,
    hidden,
  } = props;

  const showVersionPicker = state?.versionPicker?.element !== null;

  return (
    <>
      {showVersionPicker && (
        <div className={styles.top}>
          {state?.versionPicker?.element || (
            <ComponentCompareVersionPicker
              componentId={componentId}
              baseVersion={baseVersion}
              compareVersion={compareVersion}
              compareHasLocalChanges={compareHasLocalChanges}
              host={props.host}
              customUseComponent={props.customUseComponent}
            />
          )}
        </div>
      )}
      {loading && !hidden && <Loader className={classnames(styles.loader)} />}
      {!loading && (
        <div className={classnames(styles.bottom, hidden && styles.hidden)}>
          <CompareMenuNav {...props} />
          {(extractLazyLoadedData(routes) || []).length > 0 && (
            <SlotRouter routes={extractLazyLoadedData(routes) || []} />
          )}
          {state?.tabs?.element}
        </div>
      )}
    </>
  );
}

// eslint-disable-next-line complexity
export function ComponentCompare(props: ComponentCompareProps) {
  const {
    host,
    baseId: baseIdFromProps,
    compareId: compareIdFromProps,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    routes,
    state,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tabs,
    className,
    hooks,
    changes: changesFromProps,
    customUseComponent,
    Loader = CompareLoader,
    baseContext,
    compareContext,
    isFullScreen,
    hidden = false,
    compareIdOverride,
    baseIdOverride,
    ...rest
  } = props;

  const baseVersion = useCompareQueryParam('baseVersion');
  const component = useContext(ComponentContext);
  const componentDescriptor = useContext(ComponentDescriptorContext);
  const location = useLocation();
  const isWorkspace = host === 'teambit.workspace/workspace';

  const {
    component: compareComponent,
    loading: loadingCompare,
    componentDescriptor: compareComponentDescriptor,
  } = useComponent(host, compareIdOverride?.toString() || compareIdFromProps?.toString(), {
    skip: hidden || (!compareIdFromProps && !compareIdOverride),
    customUseComponent,
    logFilters: {
      log: {
        // @todo - enable it when we implement lazy loading for logs
        // limit: 3,
      },
    },
  });

  const allVersionInfo = useMemo(
    () => (compareComponent?.logs || component.logs)?.slice().sort(sortByDateDsc) || [],
    [component.id.toString(), loadingCompare, component.logs?.length, compareComponent?.logs?.length]
  );
  const isNew = useMemo(() => allVersionInfo.length === 0, [allVersionInfo]);
  const compareVersion =
    isWorkspace && !isNew && !location?.search.includes('version') && !compareIdFromProps
      ? 'workspace'
      : component.id.version;
  const compareIsLocalChanges = compareVersion === 'workspace';

  const lastVersionInfo = useMemo(() => {
    if (compareIsLocalChanges) return allVersionInfo[0];
    const prevVersionInfo = allVersionInfo.find(findPrevVersionFromCurrent(compareVersion));
    return prevVersionInfo;
  }, [component.logs?.length, loadingCompare, compareComponent?.logs?.length]);

  const baseId = React.useMemo(
    () =>
      baseIdFromProps ||
      (baseVersion && component.id.changeVersion(baseVersion)) ||
      (lastVersionInfo && component.id.changeVersion(lastVersionInfo.tag || lastVersionInfo.hash)) ||
      component.id,
    [loadingCompare, baseIdFromProps, baseVersion, lastVersionInfo?.tag, lastVersionInfo?.hash]
  );

  const {
    component: base,
    loading: loadingBase,
    componentDescriptor: baseComponentDescriptor,
  } = useComponent(host, baseIdOverride?.toString() || baseId?.toString(), {
    customUseComponent,
    skip: hidden || (!baseId && !baseIdOverride),
    logFilters: {
      log: {
        // @todo - enable it when we implement lazy loading for logs
        // limit: 3,
      },
    },
  });

  const loading = loadingBase || loadingCompare;

  const compare = compareIdFromProps ? compareComponent : component;

  const compCompareId = `${base?.id.toString()}-${compare?.id.toString()}`;

  const logsByVersion = useMemo(() => {
    return (compare?.logs || []).slice().reduce(groupByVersion, new Map<string, LegacyComponentLog>());
  }, [compare?.id.toString()]);

  const skipComponentCompareQuery =
    hidden || compareIsLocalChanges || base?.id.version?.toString() === compare?.id.version?.toString();

  const { loading: compCompareLoading, componentCompareData } = useComponentCompareQuery(
    base?.id.toString(),
    compare?.id.toString(),
    undefined,
    skipComponentCompareQuery
  );

  const fileCompareDataByName = useMemo(() => {
    if (loading || compCompareLoading) return undefined;
    if (!compCompareLoading && !componentCompareData) return null;

    const fileCompareDataByNameLookup = new Map<string, FileCompareResult>();
    (componentCompareData?.code || []).forEach((codeCompareData) => {
      fileCompareDataByNameLookup.set(codeCompareData.fileName, codeCompareData);
    });
    return fileCompareDataByNameLookup;
  }, [compCompareLoading, loading, compCompareId]);

  const fieldCompareDataByName = useMemo(() => {
    if (loading || compCompareLoading) return undefined;
    if (!compCompareLoading && !componentCompareData) return null;
    const fieldCompareDataByNameLookup = new Map<string, FieldCompareResult>();
    (componentCompareData?.aspects || []).forEach((aspectCompareData) => {
      fieldCompareDataByNameLookup.set(aspectCompareData.fieldName, aspectCompareData);
    });
    return fieldCompareDataByNameLookup;
  }, [compCompareLoading, loading, compCompareId]);

  const testCompareDataByName = useMemo(() => {
    if (loading || compCompareLoading) return undefined;
    if (!compCompareLoading && !componentCompareData) return null;
    const testCompareDataByNameLookup = new Map<string, FileCompareResult>();
    (componentCompareData?.tests || []).forEach((testCompareData) => {
      testCompareDataByNameLookup.set(testCompareData.fileName, testCompareData);
    });
    return testCompareDataByNameLookup;
  }, [compCompareLoading, loading, compCompareId]);

  const componentCompareModel = {
    compare: compare && {
      model: compare,
      descriptor: compareComponentDescriptor || componentDescriptor,
      hasLocalChanges: compareIsLocalChanges,
    },
    base: base && {
      model: base,
      descriptor: baseComponentDescriptor,
    },
    loading,
    logsByVersion,
    state,
    hooks,
    baseContext,
    compareContext,
    fieldCompareDataByName,
    fileCompareDataByName,
    testCompareDataByName,
    isFullScreen,
    hidden,
  };

  const changes =
    changesFromProps ||
    deriveChangeType(baseId, compare?.id, fileCompareDataByName, fieldCompareDataByName, testCompareDataByName);

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={classnames(styles.componentCompareContainer, className)} {...rest}>
        <RenderCompareScreen
          key={compCompareId}
          {...props}
          componentId={
            compare?.id?.toStringWithoutVersion() ||
            baseId.toStringWithoutVersion() ||
            component?.id?.toStringWithoutVersion()
          }
          baseVersion={baseId.version}
          compareVersion={compareIdFromProps?.version || component.id.version}
          compareHasLocalChanges={compareIsLocalChanges}
          changes={changes}
          loading={loading}
          Loader={Loader}
        />
      </div>
    </ComponentCompareContext.Provider>
  );
}
