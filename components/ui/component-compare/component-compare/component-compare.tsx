import React, { useContext, useMemo } from 'react';
import classnames from 'classnames';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { ComponentContext, ComponentID, useComponent } from '@teambit/component';
import { ComponentCompareContext } from '@teambit/component.ui.component-compare.context';
import { useComponentCompareQuery } from '@teambit/component.ui.component-compare.hooks.use-component-compare';
import {
  FileCompareResult,
  FieldCompareResult,
} from '@teambit/component.ui.component-compare.models.component-compare-model';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { ComponentCompareVersionPicker } from '@teambit/component.ui.component-compare.version-picker';
import { ComponentCompareBlankState } from '@teambit/component.ui.component-compare.blank-state';
import { useLocation } from '@teambit/base-react.navigation.link';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { ComponentCompareProps } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { groupByVersion } from '@teambit/component.ui.component-compare.utils.group-by-version';
import { sortByDateDsc } from '@teambit/component.ui.component-compare.utils.sort-logs';
import { extractLazyLoadedData } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { BlockSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';

import styles from './component-compare.module.scss';

const findPrevVersionFromCurrent = (compareVersion) => (_, index: number, logs: LegacyComponentLog[]) => {
  if (compareVersion === 'workspace' || logs.length === 1) return true;

  if (index === 0) return false;

  const prevIndex = index - 1;

  return logs[prevIndex].tag === compareVersion || logs[prevIndex].hash === compareVersion;
};

// eslint-disable-next-line complexity
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
    changes: changesFromProps,
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

  const isEmpty = !compareIsLocalChanges && !loading && compare?.id.toString() === base?.id.toString();

  const compCompareId = `${base?.id.toString()}-${compare?.id.toString()}`;

  const logsByVersion = useMemo(() => {
    return (compare?.logs || []).slice().reduce(groupByVersion, new Map<string, LegacyComponentLog>());
  }, [compare?.id.toString()]);

  const skipComponentCompareQuery =
    compareIsLocalChanges || base?.id.version?.toString() === compare?.id.version?.toString();

  const { loading: compCompareLoading, componentCompareData } = useComponentCompareQuery(
    base?.id.toString(),
    compare?.id.toString(),
    undefined,
    skipComponentCompareQuery
  );

  const fileCompareDataByName = useMemo(() => {
    if (loading || compCompareLoading) return undefined;
    if (!compCompareLoading && !componentCompareData) return null;

    const _fileCompareDataByName = new Map<string, FileCompareResult>();
    (componentCompareData?.code || []).forEach((codeCompareData) => {
      _fileCompareDataByName.set(codeCompareData.fileName, codeCompareData);
    });
    return _fileCompareDataByName;
  }, [compCompareLoading, loading, compCompareId]);

  const fieldCompareDataByName = useMemo(() => {
    if (loading || compCompareLoading) return undefined;
    if (!compCompareLoading && !componentCompareData) return null;
    const _fieldCompareDataByName = new Map<string, FieldCompareResult>();
    (componentCompareData?.aspects || []).forEach((aspectCompareData) => {
      _fieldCompareDataByName.set(aspectCompareData.fieldName, aspectCompareData);
    });
    return _fieldCompareDataByName;
  }, [compCompareLoading, loading, compCompareId]);

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

  const changes =
    changesFromProps || deriveChangeType(baseId, compare?.id, fileCompareDataByName, fieldCompareDataByName);

  return (
    <ComponentCompareContext.Provider value={componentCompareModel}>
      <div className={classnames(styles.componentCompareContainer, className)} {...rest}>
        {loading && <Loader className={classnames(styles.loader)} />}
        {isEmpty && <ComponentCompareBlankState />}
        {!loading && !isEmpty && <RenderCompareScreen key={compCompareId} {...props} changes={changes} />}
      </div>
    </ComponentCompareContext.Provider>
  );
}

function RenderCompareScreen(props: ComponentCompareProps) {
  const { routes, state } = props;
  const showVersionPicker = state?.versionPicker?.element !== null;

  return (
    <>
      {showVersionPicker && (
        <div className={styles.top}>{state?.versionPicker?.element || <ComponentCompareVersionPicker />}</div>
      )}
      <div className={styles.bottom}>
        {/* <CompareMenuNav {...props} /> */}
        {(extractLazyLoadedData(routes) || []).length > 0 && (
          <SlotRouter routes={extractLazyLoadedData(routes) || []} />
        )}
        {state?.tabs?.element}
      </div>
    </>
  );
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

function deriveChangeType(
  baseId?: ComponentID,
  compareId?: ComponentID,
  fileCompareDataByName?: Map<string, FileCompareResult> | null,
  fieldCompareDataByName?: Map<string, FieldCompareResult> | null
): ChangeType[] | undefined | null {
  if (!baseId && !compareId) return null;
  if (!baseId?.version) return [ChangeType.NEW];

  if (fileCompareDataByName === null || fieldCompareDataByName === null) return null;
  if (fileCompareDataByName === undefined || fieldCompareDataByName === undefined) return undefined;

  if (
    fieldCompareDataByName.size === 0 &&
    (fileCompareDataByName.size === 0 || [...fileCompareDataByName.values()].every((f) => f.status === 'UNCHANGED'))
  ) {
    return [ChangeType.NONE];
  }

  const changed: ChangeType[] = [];
  const DEPS_FIELD = ['dependencies', 'devDependencies', 'extensionDependencies'];

  if (fileCompareDataByName.size > 0 && [...fileCompareDataByName.values()].some((f) => f.status !== 'UNCHANGED')) {
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
