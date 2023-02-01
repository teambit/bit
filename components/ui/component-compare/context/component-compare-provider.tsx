import React, { useMemo } from 'react';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { ComponentID, useComponent, UseComponentType, useIdFromLocation } from '@teambit/component';
import { ComponentCompareContext } from '@teambit/component.ui.component-compare.context';
import {
  UseComponentCompareQuery,
  useComponentCompareQuery,
} from '@teambit/component.ui.component-compare.hooks.use-component-compare';
import {
  FileCompareResult,
  FieldCompareResult,
  ComponentCompareModel,
} from '@teambit/component.ui.component-compare.models.component-compare-model';
import { useCompareQueryParam } from '@teambit/component.ui.component-compare.hooks.use-component-compare-url';
import { useLocation } from '@teambit/base-react.navigation.link';
import { groupByVersion } from '@teambit/component.ui.component-compare.utils.group-by-version';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { isFunction } from 'lodash';
import { sortByDateDsc } from '@teambit/component.ui.component-compare.utils.sort-logs';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

function getComponentIdStr(componentIdStr?: string | (() => string | undefined)): string | undefined {
  if (isFunction(componentIdStr)) return componentIdStr();
  return componentIdStr;
}

export type ComponentCompareProviderProps = {
  host: string;
  baseId?: ComponentID;
  compareId?: ComponentID;
  url?: string;
  useComponentIdFromLocation?: (url?: string) => string;
  componentIdStr?: string | (() => string | undefined);
  customUseComponent?: UseComponentType;
  customUseComponentCompare?: UseComponentCompareQuery;
  changes?: ChangeType[] | null;
  children: React.ReactNode;
};

export function ComponentCompareProvider(props: ComponentCompareProviderProps) {
  const {
    host,
    baseId: _baseId,
    compareId: _compareId,
    changes: changesFromProps,
    componentIdStr,
    url,
    useComponentIdFromLocation = useIdFromLocation,
    customUseComponent,
    customUseComponentCompare = useComponentCompareQuery,
    children,
  } = props;
  const { pathname = '/', search } = useLocation() || {};
  // override default splat from location when viewing a lane component
  const laneCompUrl = pathname.split(LanesModel.baseLaneComponentRoute.concat('/'))[1];
  const idFromLocation = useComponentIdFromLocation(url || laneCompUrl || pathname.substring(1));
  const query = useQuery();
  const compareVersionFromUrl = query.get('version');
  const _componentIdStr = getComponentIdStr(componentIdStr);
  const componentId = _componentIdStr ? ComponentID.fromString(_componentIdStr) : undefined;
  const compareIdStr =
    _compareId?.toString() ||
    componentId?.toString() ||
    `${idFromLocation}${compareVersionFromUrl ? `@${compareVersionFromUrl}` : ``}`;

  const { component: compare, loading: loadingCompare } = useComponent(host, compareIdStr, {
    skip: !compareIdStr,
    customUseComponent,
  });

  const allVersionInfo = useMemo(
    () => compare?.logs?.slice().sort(sortByDateDsc) || [],
    [compare?.id.toString(), loadingCompare]
  );

  const baseVersion = useCompareQueryParam('baseVersion');
  const baseId = _baseId || (!!baseVersion && !!compare && compare.id.changeVersion(baseVersion));

  const isNew = allVersionInfo.length === 0;
  const isWorkspace = host === 'teambit.workspace/workspace';
  const compareVersion = isWorkspace && !isNew && !search?.includes('version') ? 'workspace' : compare?.id.version;

  const compareIsLocalChanges = compareVersion === 'workspace';

  const { component: base, loading: loadingBase } = useComponent(host, baseId?.toString(), {
    customUseComponent,
    skip: !baseId,
  });

  const loading = loadingBase || loadingCompare;

  const compCompareId = `${base?.id.toString()}-${compare?.id.toString()}`;

  const logsByVersion = useMemo(() => {
    return (compare?.logs || []).slice().reduce(groupByVersion, new Map<string, LegacyComponentLog>());
  }, [compare?.id.toString()]);

  const skipComponentCompareQuery = base?.id.version?.toString() === compare?.id.version?.toString();

  const { loading: compCompareLoading, componentCompareData } = customUseComponentCompare(
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

  const changes =
    changesFromProps ||
    (baseId && deriveChangeType(baseId, compare?.id, fileCompareDataByName, fieldCompareDataByName)) ||
    undefined;

  const componentCompareModel: ComponentCompareModel = {
    compare: compare && {
      model: compare,
      hasLocalChanges: false,
    },
    base: base && {
      model: base,
    },
    loading,
    logsByVersion,
    fieldCompareDataByName,
    fileCompareDataByName,
    changes,
    isComparing: loading || (!compareIsLocalChanges && !!base?.id && !!compare?.id),
  };

  return <ComponentCompareContext.Provider value={componentCompareModel}> {children}</ComponentCompareContext.Provider>;
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
