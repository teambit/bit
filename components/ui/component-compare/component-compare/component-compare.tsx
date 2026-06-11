/* eslint-disable react/destructuring-assignment */
/* eslint-disable react/require-default-props */
/* eslint-disable @typescript-eslint/no-use-before-define */ // hoisted function components used before their definition
import type { HTMLAttributes, ReactNode } from 'react';
import React, { useContext, useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import classnames from 'classnames';
import { useCode } from '@teambit/code.ui.queries.get-component-code';
import { ComponentID as ComponentIdValue } from '@teambit/component-id';
import type { LegacyComponentLog } from '@teambit/legacy-component-log';
import type { ComponentID, NavPlugin } from '@teambit/component';
import { CollapsibleMenuNav, ComponentContext, ComponentDescriptorContext, useComponent } from '@teambit/component';
import { ComponentCompareContext } from '@teambit/component.ui.component-compare.context';
import { useComponentCompareQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare';
import type {
  FileCompareResult,
  FieldCompareResult,
} from '@teambit/component.ui.component-compare.models.component-compare-model';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import type { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
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
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import type { ComponentComparePair, CompareComponentData } from './compare-data-context';
import { useCompareData } from './compare-data-context';
import { useFileRegistryRegister, useAspectRegistryRegister } from './file-registry';

import styles from './component-compare.module.scss';

// Extend ChangeType with API (the external enum doesn't have it yet)
const ChangeTypeAPI = 'API' as unknown as ChangeType;

export type APIDiffDetail = {
  changeKind: string;
  description: string;
  impact: string;
  from?: string;
  to?: string;
};

export type APIDiffChange = {
  status: string;
  visibility: string;
  exportName: string;
  schemaType: string;
  schemaTypeRaw: string;
  impact: string;
  baseSignature?: string;
  compareSignature?: string;
  baseNode?: Record<string, any>;
  compareNode?: Record<string, any>;
  changes?: APIDiffDetail[];
};

export type APIDiffResult = {
  hasChanges: boolean;
  impact: string;
  publicChanges: APIDiffChange[];
  internalChanges: APIDiffChange[];
  changes: APIDiffChange[];
  added: number;
  removed: number;
  modified: number;
  breaking: number;
  nonBreaking: number;
  patch: number;
};

const QUERY_API_DIFF = gql`
  query ComponentCompareAPIDiff($baseId: String!, $compareId: String!) {
    getHost {
      id
      apiDiff(baseId: $baseId, compareId: $compareId) {
        hasChanges
        impact
        added
        removed
        modified
        breaking
        nonBreaking
        patch
        publicChanges {
          status
          visibility
          exportName
          schemaType
          schemaTypeRaw
          impact
          baseSignature
          compareSignature
          baseNode
          compareNode
          changes {
            changeKind
            description
            impact
            from
            to
          }
        }
        internalChanges {
          status
          visibility
          exportName
          schemaType
          schemaTypeRaw
          impact
          baseSignature
          compareSignature
          changes {
            changeKind
            description
            impact
            from
            to
          }
        }
      }
    }
  }
`;

function useAPIDiffQuery(
  baseId?: string,
  compareId?: string,
  skip?: boolean
): { loading?: boolean; apiDiffResult?: APIDiffResult | null } {
  const { data, loading } = useDataQuery<{
    getHost: { apiDiff: APIDiffResult | null };
  }>(QUERY_API_DIFF, {
    variables: { baseId, compareId },
    skip: skip || !baseId || !compareId || baseId === compareId,
  });

  return {
    loading,
    apiDiffResult: data?.getHost?.apiDiff,
  };
}

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
    [changed]
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
              ...tab.props,
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
  testCompareDataByName?: Map<string, FileCompareResult> | null,
  apiDiffResult?: APIDiffResult | null
): ChangeType[] | undefined | null {
  if (!baseId && !compareId) return null;
  if (!baseId?.version) return [ChangeType.NEW];

  if (fileCompareDataByName === null || fieldCompareDataByName === null) return null;
  if (fileCompareDataByName === undefined || fieldCompareDataByName === undefined) return undefined;

  const fileCompareData = [...fileCompareDataByName.values()];

  const hasApiChanges = apiDiffResult?.hasChanges ?? false;

  if (
    fieldCompareDataByName.size === 0 &&
    (fileCompareDataByName.size === 0 || fileCompareData.every((f) => f.status === 'UNCHANGED')) &&
    !hasApiChanges
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

  if (hasApiChanges) {
    changed.push(ChangeTypeAPI);
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
    host: hostFromProps,
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
  const isWorkspace = hostFromProps === 'teambit.workspace/workspace';
  const compareHost =
    isWorkspace && !location?.search.includes('version') && !compareIdFromProps && component.logs?.length === 0
      ? hostFromProps
      : 'teambit.scope/scope';
  const host = 'teambit.scope/scope';
  const {
    component: compareComponent,
    loading: loadingCompare,
    componentDescriptor: compareComponentDescriptor,
  } = useComponent(compareHost, compareIdOverride?.toString() || compareIdFromProps?.toString(), {
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
    hidden || (base?.id.version?.toString() === compare?.id.version?.toString() && !compareIsLocalChanges);

  const { loading: compCompareLoading, componentCompareData } = useComponentCompareQuery(
    base?.id.toString(),
    compare?.id.toString(),
    undefined,
    skipComponentCompareQuery
  );

  const { loading: apiDiffLoading, apiDiffResult } = useAPIDiffQuery(
    base?.id.toString(),
    compare?.id.toString(),
    hidden
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

  const resolvedApiDiff = useMemo(() => {
    if (loading || apiDiffLoading) return undefined;
    return apiDiffResult ?? null;
  }, [loading, apiDiffLoading, compCompareId, apiDiffResult]);

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
    apiDiffResult: resolvedApiDiff,
    isFullScreen,
    hidden,
  };

  const changes =
    changesFromProps ||
    deriveChangeType(
      baseId,
      compare?.id,
      fileCompareDataByName,
      fieldCompareDataByName,
      testCompareDataByName,
      resolvedApiDiff
    );

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

// ---------------------------------------------------------------------------
// InlineComponentCompare + ComponentCompareHeader (ported from new-changes)
// ---------------------------------------------------------------------------

export type InlineComponentCompareProps = {
  name: string;
  baseId?: string;
  compareId: string;
  baseVersion?: string;
  compareVersion?: string;
  baseUrl?: string;
  compareUrl?: string;
  envIcon?: string;
  changeTags?: Array<{ label: string; color: string }>;
  accentColor?: string;
  tabs?: TabItem[];
  allTabs?: TabItem[];
  children?: ReactNode;
  className?: string;
  host?: string;
  previewUrl?: string;
  /**
   * Provide the base/compare model+descriptor directly instead of letting the inner context re-fetch
   * them by id. Needed for the single-component compare page: in workspace local-changes mode
   * `compareId` is deliberately set equal to `baseId` (to trigger the server's local diff for the
   * bulk code query), so re-fetching by id would load the same snap for both sides — making deps/
   * config/preview identical. The page already holds the correct pair (base = the scope's published
   * snap, compare = the live workspace component), so it passes them through here. `compareId` is
   * still used as-is to key the bulk code/aspect/test data. Lane-compare omits these and re-fetches.
   */
  baseOverride?: { model?: any; descriptor?: any; hasLocalChanges?: boolean };
  compareOverride?: { model?: any; descriptor?: any; hasLocalChanges?: boolean };
  /**
   * Extra `data-*` attributes stamped on the panel root. Lane-compare uses these (`data-has-code`,
   * `data-has-deps`, …) to drive per-view-mode visibility purely in CSS, so switching modes never
   * remounts panels — it only flips the `[data-view-mode]` attribute on the pane. The object MUST be
   * referentially stable across view-mode changes (derive it from view-mode-independent data) or it
   * defeats React.memo and reintroduces the re-render storm this whole design avoids.
   */
  dataAttributes?: Record<string, string>;
};

/**
 * forwardRef + React.memo. Without memo, every parent re-render (e.g. `setViewMode` in lane-compare)
 * re-renders all 10 mounted panels and all their nested tab subtrees — which was the source of the
 * "view-mode switching is slow" feedback. With memo + stable props (lane-compare's `allTabs` array
 * is hoisted to module scope), a viewMode click is now just a CSS attribute change on the
 * `[data-view-mode]` container; the panels don't reconcile at all.
 */
const InlineComponentCompareInner = forwardRef<HTMLDivElement, InlineComponentCompareProps>(
  function InlineComponentCompare(
    {
      name,
      baseId,
      compareId,
      baseVersion,
      compareVersion,
      baseUrl,
      compareUrl,
      envIcon,
      changeTags,
      accentColor,
      tabs,
      allTabs,
      children,
      className,
      host = 'teambit.scope/scope',
      baseOverride,
      compareOverride,
      dataAttributes,
    },
    ref
  ) {
    const sectionRef = useRef<HTMLDivElement>(null);
    const [hasBeenVisible, setHasBeenVisible] = useState(false);

    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        (sectionRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        if (typeof ref === 'function') ref(node);
        // eslint-disable-next-line no-param-reassign
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref]
    );

    useEffect(() => {
      const el = sectionRef.current;
      if (!el) return undefined;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setHasBeenVisible(true);
            observer.disconnect();
          }
        },
        { rootMargin: '400px 0px' }
      );
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const headerStyle = accentColor ? ({ '--component-accent': accentColor } as React.CSSProperties) : undefined;

    return (
      <div
        ref={setRefs}
        className={`${styles.componentCompare} ${className || ''}`}
        data-component-id={compareId.split('@')[0]}
        style={headerStyle}
        {...dataAttributes}
      >
        <ComponentCompareHeader
          name={name}
          envIcon={envIcon}
          baseVersion={baseVersion}
          compareVersion={compareVersion}
          baseUrl={baseUrl}
          compareUrl={compareUrl}
          changeTags={changeTags}
        />

        {!baseId && !!compareId && <NewComponentFileRegistrar compareId={compareId} />}

        {!hasBeenVisible && <InlineSkeleton lines={1} />}

        {hasBeenVisible && (
          <InlineContextProvider
            baseId={baseId}
            compareId={compareId}
            host={host}
            baseOverride={baseOverride}
            compareOverride={compareOverride}
          >
            {allTabs
              ? allTabs.map((tab) => (
                  <DeferredTab key={tab.id} tabId={tab.id}>
                    {tab.element}
                  </DeferredTab>
                ))
              : tabs && tabs.map((tab) => <div key={tab.id}>{tab.element}</div>)}
            {children}
          </InlineContextProvider>
        )}
      </div>
    );
  }
);
export const InlineComponentCompare = React.memo(InlineComponentCompareInner);

/**
 * Tab wrapper that just stamps a `data-tab-id` for CSS-driven visibility (rules live in
 * `lane-compare.module.scss`, scoped by `data-view-mode`). Previously gated children on
 * `el.offsetParent !== null` to defer mounting until visible — that turned each view-mode switch
 * into a fresh data-fetch storm because the lazily-mounted panel re-fired all its queries. We now
 * mount all tabs eagerly and rely on Apollo's per-query cache (warmed by the lane-compare
 * pre-fetch) to keep first paint cheap. The `data-tab-id` attribute remains so CSS can hide
 * non-active tabs.
 */
export function DeferredTab({ tabId, children }: { tabId: string; children: ReactNode }) {
  return <div data-tab-id={tabId}>{children}</div>;
}

function InlineContextProvider({
  baseId,
  compareId,
  host = 'teambit.scope/scope',
  baseOverride,
  compareOverride,
  children,
}: {
  baseId?: string;
  compareId?: string;
  host?: string;
  baseOverride?: { model?: any; descriptor?: any; hasLocalChanges?: boolean };
  compareOverride?: { model?: any; descriptor?: any; hasLocalChanges?: boolean };
  children: ReactNode;
}) {
  const isNew = !baseId && !!compareId;

  // When the caller supplies the model/descriptor (single-component page), use it and skip the fetch
  // — re-fetching by id would be redundant and, in local-changes mode (compareId === baseId), wrong.
  const { component: fetchedBaseModel, componentDescriptor: fetchedBaseDescriptor } = useComponent(host, baseId, {
    skip: !baseId || !!baseOverride,
    context: { batch: true },
  });
  const { component: fetchedCompareModel, componentDescriptor: fetchedCompareDescriptor } = useComponent(
    host,
    compareId,
    {
      skip: !compareId || !!compareOverride,
      context: { batch: true },
    }
  );

  const baseModel = baseOverride?.model ?? fetchedBaseModel;
  const baseDescriptor = baseOverride?.descriptor ?? fetchedBaseDescriptor;
  const compareModel = compareOverride?.model ?? fetchedCompareModel;
  const compareDescriptor = compareOverride?.descriptor ?? fetchedCompareDescriptor;

  const hasBase = !baseId || !!baseModel;
  const hasCompare = !compareId || !!compareModel;

  const compareData = useCompareData();
  const componentCompareData = compareId ? compareData?.getData(compareId) : undefined;
  // for non-new components with a compareId: undefined = bulk page not loaded yet, null = pair failed to compare.
  // a component with no compareId (deleted in the compare lane) is never in the bulk pairs, so it is not "loading".
  const compCompareLoading = !isNew && !!compareId && componentCompareData === undefined;

  const { fileTree: newCompFileTree, loading: newCompCodeLoading } = useCode(isNew ? compareModel?.id : undefined);

  const fileCompareDataByName = useMemo(() => {
    if (isNew) {
      if (newCompCodeLoading || !newCompFileTree) return undefined;
      const lookup = new Map();
      newCompFileTree.forEach((fileName: string) => {
        lookup.set(fileName, { fileName, baseContent: '', compareContent: undefined, status: 'NEW' });
      });
      return lookup;
    }
    if (compCompareLoading) return undefined;
    if (!componentCompareData) return null;
    const lookup = new Map();
    (componentCompareData.code || []).forEach((f: any) => {
      lookup.set(f.fileName, f);
    });
    return lookup;
  }, [isNew, newCompCodeLoading, newCompFileTree, compCompareLoading, componentCompareData]);

  const fieldCompareDataByName = useMemo(() => {
    if (compCompareLoading) return undefined;
    if (!componentCompareData) return null;
    const lookup = new Map();
    (componentCompareData.aspects || []).forEach((a: any) => lookup.set(a.fieldName, a));
    return lookup;
  }, [compCompareLoading, componentCompareData]);

  const testCompareDataByName = useMemo(() => {
    if (compCompareLoading) return undefined;
    if (!componentCompareData) return null;
    const lookup = new Map();
    (componentCompareData.tests || []).forEach((t: any) => lookup.set(t.fileName, t));
    return lookup;
  }, [compCompareLoading, componentCompareData]);

  if (!hasBase || !hasCompare) {
    return <InlineSkeleton lines={2} />;
  }

  const contextValue = {
    base: baseModel ? { model: baseModel, descriptor: baseDescriptor } : undefined,
    compare: compareModel
      ? { model: compareModel, descriptor: compareDescriptor, hasLocalChanges: compareOverride?.hasLocalChanges }
      : undefined,
    loading: compCompareLoading,
    logsByVersion: new Map(),
    fileCompareDataByName,
    fieldCompareDataByName,
    testCompareDataByName,
    isFullScreen: false,
    hidden: false,
  };

  return <ComponentCompareContext.Provider value={contextValue as any}>{children}</ComponentCompareContext.Provider>;
}

/**
 * registers the file list of a NEW component (one with no base) into the FileRegistry for the sidebar.
 * non-new components are fed in bulk by `RegistryFeeder`. `useCode` is an external hook that cannot
 * forward a batch context, so these (minority) queries stay unbatched.
 * compositions are intentionally not registered here — the FileRegistry compositions store has no
 * readers; `lane-compare.tsx` derives composition info independently from `useLaneComponents`.
 */
export function NewComponentFileRegistrar({ compareId }: { compareId: string }) {
  const newCompId = useMemo(() => ComponentIdValue.fromString(compareId), [compareId]);
  const { fileTree: newCompFileTree, loading } = useCode(newCompId);

  const registryFiles = useMemo(() => {
    if (loading || !newCompFileTree?.length) return undefined;
    return newCompFileTree.map((n: string) => ({ name: n, status: 'NEW' }));
  }, [loading, newCompFileTree]);

  useFileRegistryRegister(compareId.split('@')[0], registryFiles);

  return null;
}

export type ComponentCompareHeaderProps = {
  name: string;
  envIcon?: string;
  baseVersion?: string;
  compareVersion?: string;
  baseUrl?: string;
  compareUrl?: string;
  changeTags?: Array<{ label: string; color: string }>;
};

export function ComponentCompareHeader({
  name,
  envIcon,
  baseVersion,
  compareVersion,
  baseUrl,
  compareUrl,
  changeTags,
}: ComponentCompareHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        {envIcon ? (
          <img src={envIcon} className={styles.envIcon} alt="" />
        ) : (
          <span className={styles.envIconPlaceholder} />
        )}
        <span className={styles.componentName}>{name}</span>
      </div>
      <div className={styles.headerRight}>
        {changeTags && changeTags.length > 0 && (
          <div className={styles.changeTags}>
            {changeTags.map((t) => (
              <span key={t.label} className={styles.changeTag} style={{ color: t.color, background: `${t.color}14` }}>
                {t.label}
              </span>
            ))}
          </div>
        )}
        <div className={styles.versions}>
          {baseVersion &&
            (baseUrl ? (
              <a className={styles.versionHash} href={baseUrl} target="_blank" rel="noopener noreferrer">
                {baseVersion}
              </a>
            ) : (
              <span className={styles.versionHash}>{baseVersion}</span>
            ))}
          {baseVersion && compareVersion && <span className={styles.versionArrow}>→</span>}
          {compareVersion &&
            (compareUrl ? (
              <a className={styles.versionHash} href={compareUrl} target="_blank" rel="noopener noreferrer">
                {compareVersion}
              </a>
            ) : (
              <span className={styles.versionHash}>{compareVersion}</span>
            ))}
        </div>
      </div>
    </div>
  );
}

function InlineSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={styles.skeleton}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={styles.skeletonBar} style={{ width: `${40 + (i % 3) * 20}%` }} />
      ))}
    </div>
  );
}

/** registers one component's bulk compare data into the FileRegistry. renders nothing. */
function CompareRegistryEntry({ compareId }: { compareId: string }) {
  const compareData = useCompareData();
  const data: CompareComponentData | null | undefined = compareData?.getData(compareId);
  const componentIdStr = compareId.split('@')[0];

  // `data` is undefined while the bulk page loads and null if the pair failed to compare;
  // both intentionally register nothing (matching the prior per-component behavior on failure).
  const registryFiles = useMemo(() => {
    if (!data) return undefined;
    return (data.code || [])
      .filter((f) => f.status !== 'UNCHANGED')
      .map((f) => ({ name: f.fileName, status: f.status }));
  }, [data]);

  const aspectRegistryFiles = useMemo(() => {
    if (!data) return undefined;
    return (data.aspects || []).map((a) => ({ name: a.fieldName, status: 'MODIFIED' }));
  }, [data]);

  useFileRegistryRegister(componentIdStr, registryFiles);
  useAspectRegistryRegister(componentIdStr, aspectRegistryFiles);

  return null;
}

/**
 * feeds the FileRegistry from the bulk `CompareDataProvider` for every component pair that has a base.
 * renders one null-rendering `CompareRegistryEntry` per pair — no per-component queries are fired.
 */
export function RegistryFeeder({ pairs }: { pairs: ComponentComparePair[] }) {
  return (
    <>
      {pairs.map((pair) => (
        <CompareRegistryEntry key={pair.compareId} compareId={pair.compareId} />
      ))}
    </>
  );
}
