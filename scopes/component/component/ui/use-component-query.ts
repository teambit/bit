import React, { useMemo, useEffect, useRef } from 'react';
import { gql } from '@apollo/client';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';

export const componentIdFields = gql`
  fragment componentIdFields on ComponentID {
    name
    version
    scope
  }
`;

export const componentOverviewFields = gql`
  fragment componentOverviewFields on Component {
    id {
      ...componentIdFields
    }
    aspects(include: ["teambit.preview/preview", "teambit.envs/envs"]) {
      # 'id' property in gql refers to a *global* identifier and used for caching.
      # this makes aspect data cache under the same key, even when they are under different components.
      # renaming the property fixes that.
      id
      data
    }
    elementsUrl
    description
    deprecation {
      isDeprecate
      newId
    }
    labels
    displayName
    server {
      env
      url
      host
      basePath
    }
    buildStatus
    env {
      id
      icon
    }
    size {
      compressedTotal
    }
    preview {
      includesEnvTemplate
      legacyHeader
      isScaling
      skipIncludes
    }
    compositions {
      identifier
      displayName
    }
  }
  ${componentIdFields}
`;

export const componentFields = gql`
  fragment componentFields on Component {
    id {
      ...componentIdFields
    }
    ...componentOverviewFields
    packageName
    latest
    compositions {
      identifier
      displayName
    }
    tags {
      version
    }
    logs(
      type: $logType
      offset: $logOffset
      limit: $logLimit
      sort: $logSort
      takeHeadFromComponent: $takeHeadFromComponent
      head: $logHead
      startFrom: $logStartFrom
      until: $logUntil
    ) @skip(if: $fetchLogsByTypeSeparately) {
      id
      message
      username
      email
      date
      hash
      tag
    }
    tagLogs: logs(
      type: "tag"
      offset: $tagLogOffset
      limit: $tagLogLimit
      sort: $tagLogSort
      takeHeadFromComponent: $tagTakeHeadFromComponent
      head: $tagLogHead
      startFrom: $tagStartFrom
      until: $tagUntil
    ) @include(if: $fetchLogsByTypeSeparately) {
      id
      message
      username
      email
      date
      hash
      tag
    }
    snapLogs: logs(
      type: "snap"
      offset: $snapLogOffset
      limit: $snapLogLimit
      sort: $snapLogSort
      takeHeadFromComponent: $snapTakeHeadFromComponent
      head: $snapLogHead
      startFrom: $snapStartFrom
      until: $snapUntil
    ) @include(if: $fetchLogsByTypeSeparately) {
      id
      message
      username
      email
      date
      hash
      tag
    }
  }
  ${componentIdFields}
  ${componentOverviewFields}
`;

export const COMPONENT_QUERY_FIELDS = `
    $logOffset: Int
    $logLimit: Int
    $logType: String
    $logHead: String
    $logSort: String
    $logStartFrom: String
    $logUntil: String
    $tagLogOffset: Int
    $tagLogLimit: Int
    $tagLogHead: String
    $tagLogSort: String
    $tagStartFrom: String
    $tagUntil: String
    $snapLogOffset: Int
    $snapLogLimit: Int
    $snapLogHead: String
    $snapLogSort: String
    $snapStartFrom: String
    $snapUntil: String
    $takeHeadFromComponent: Boolean
    $tagTakeHeadFromComponent: Boolean
    $snapTakeHeadFromComponent: Boolean
    $fetchLogsByTypeSeparately: Boolean!`;

const GET_COMPONENT = gql`
  query Component(
    ${COMPONENT_QUERY_FIELDS} 
    $extensionId: String!
    $id: String!
    ) {
    getHost(id: $extensionId) {
      id # used for GQL caching
      get(id: $id) {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const SUB_SUBSCRIPTION_ADDED = gql`
  subscription OnComponentAdded(${COMPONENT_QUERY_FIELDS}) {
    componentAdded {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const SUB_COMPONENT_CHANGED = gql`
  subscription OnComponentChanged(${COMPONENT_QUERY_FIELDS}) {
    componentChanged {
      component {
        ...componentFields
      }
    }
  }
  ${componentFields}
`;

const SUB_COMPONENT_REMOVED = gql`
  subscription OnComponentRemoved {
    componentRemoved {
      componentIds {
        ...componentIdFields
      }
    }
  }
  ${componentIdFields}
`;

export type LogFilter = {
  logOffset?: number;
  logLimit?: number;
  logHead?: string;
  logStartFrom?: string;
  logUntil?: string;
  logSort?: string;
  takeHeadFromComponent?: boolean;
};

export type Filters = {
  log?: LogFilter & { logType?: string };
  tagLog?: LogFilter;
  snapLog?: LogFilter;
  fetchLogsByTypeSeparately?: boolean;
  loading?: boolean;
};

export type ComponentQueryResult = {
  component?: ComponentModel;
  componentDescriptor?: ComponentDescriptor;
  // @todo refactor to useComponentLogs
  componentLogs?: {
    hasMoreLogs?: boolean;
    hasMoreSnaps?: boolean;
    hasMoreTags?: boolean;
    loadMoreLogs?: (backwards?: boolean, offset?: number) => void;
    loadMoreTags?: (backwards?: boolean, offset?: number) => void;
    loadMoreSnaps?: (backwards?: boolean, offset?: number) => void;
    snaps?: LegacyComponentLog[];
    tags?: LegacyComponentLog[];
  };
  loading?: boolean;
  error?: ComponentError;
};
function getOffsetValue(offset, limit, backwards = false) {
  if (offset !== undefined) {
    return backwards ? -offset : offset;
  }
  if (limit !== undefined) {
    return 0;
  }
  return undefined;
}
/**
 * Calculates the new offset based on initial offset, current offset, and the number of logs.
 *
 * @param {boolean} [fetchLogsByTypeSeparately] A flag to determine if logs are fetched by type separately.
 * @param {number} [initialOffset] The initial offset.
 * @param {number} [currentOffset] The current offset.
 * @param {any[]} [logs=[]] The array of logs.
 *
 * @returns {number | undefined} -  new offset
 */
function calculateNewOffset(initialOffset = 0, currentOffset = 0, logs: any[] = []): number | undefined {
  const logCount = logs.length;

  if (initialOffset !== currentOffset && logCount + initialOffset >= currentOffset) return currentOffset;
  return logCount + initialOffset;
}

/**
 * Calculate the availability of more logs.
 *
 * @param {number | undefined} logLimit - The limit for the logs.
 * @param {any} rawComponent - The raw component object containing logs.
 * @param {string} logType - Type of log ('logs', 'tagLogs', 'snapLogs').
 * @param {boolean | undefined} currentHasMoreLogs - Current state of having more logs.
 *
 * @returns {boolean | undefined} - Whether there are more logs available.
 */
function calculateHasMoreLogs(
  // @todo account for limit (the API gives the nearest nodes to the limit, not the exact limit)
  logLimit?: number,
  rawComponent?: any,
  logType = 'logs',
  currentHasMoreLogs?: boolean
): boolean | undefined {
  if (!logLimit) return false;
  if (rawComponent === undefined) return undefined;
  if (currentHasMoreLogs === undefined) return !!rawComponent?.[logType]?.length;
  return currentHasMoreLogs;
}
/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(
  componentId: string,
  host: string,
  filters?: Filters,
  skip?: boolean
): ComponentQueryResult {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  const { fetchLogsByTypeSeparately = false, log, tagLog, snapLog } = filters || {};
  const {
    logHead: tagLogHead,
    logOffset: tagLogOffset,
    logSort: tagLogSort,
    logLimit: tagLogLimit,
    takeHeadFromComponent: tagLogTakeHeadFromComponent,
    logStartFrom: tagStartFrom,
    logUntil: tagUntil,
  } = tagLog || {};
  const { logHead, logOffset, logSort, logLimit, takeHeadFromComponent, logType, logStartFrom, logUntil } = log || {};
  const {
    logHead: snapLogHead,
    logOffset: snapLogOffset,
    logSort: snapLogSort,
    logLimit: snapLogLimit,
    takeHeadFromComponent: snapLogTakeHeadFromComponent,
    logStartFrom: snapStartFrom,
    logUntil: snapUntil,
  } = snapLog || {};
  const variables = {
    id: componentId,
    extensionId: host,
    fetchLogsByTypeSeparately,
    snapLogOffset: getOffsetValue(snapLogOffset, snapLogLimit),
    tagLogOffset: getOffsetValue(tagLogOffset, tagLogLimit),
    logOffset: getOffsetValue(logOffset, logLimit),
    logLimit,
    snapLogLimit,
    tagLogLimit,
    logType,
    logHead,
    snapLogHead,
    tagLogHead,
    logStartFrom,
    snapStartFrom,
    tagStartFrom,
    logUntil,
    snapUntil,
    tagUntil,
    logSort,
    snapLogSort,
    tagLogSort,
    takeHeadFromComponent,
    snapLogTakeHeadFromComponent,
    tagLogTakeHeadFromComponent,
  };
  const offsetRef = useRef(logOffset);
  const tagOffsetRef = useRef(tagLogOffset);
  const snapOffsetRef = useRef(snapLogOffset);
  const hasMoreLogs = useRef<boolean | undefined>(undefined);
  const hasMoreTagLogs = useRef<boolean | undefined>(undefined);
  const hasMoreSnapLogs = useRef<boolean | undefined>(undefined);
  const { data, error, loading, subscribeToMore, fetchMore, ...rest } = useDataQuery(GET_COMPONENT, {
    variables,
    skip,
    errorPolicy: 'all',
  });

  const rawComponent = data?.getHost?.get;
  const rawTags: Array<any> = rawComponent?.tagLogs ?? [];
  const rawSnaps: Array<any> = rawComponent?.snapLogs ?? [];
  const rawCompLogs: Array<any> = rawComponent?.logs ?? mergeLogs(rawTags, rawSnaps);
  offsetRef.current = useMemo(
    () => calculateNewOffset(logOffset, offsetRef.current, rawCompLogs),
    [rawCompLogs, fetchLogsByTypeSeparately, logOffset]
  );

  tagOffsetRef.current = useMemo(
    () => calculateNewOffset(tagLogOffset, tagOffsetRef.current, rawTags),
    [rawTags, fetchLogsByTypeSeparately, tagLogOffset]
  );

  snapOffsetRef.current = useMemo(
    () => calculateNewOffset(snapLogOffset, snapOffsetRef.current, rawSnaps),
    [rawSnaps, fetchLogsByTypeSeparately, snapLogOffset]
  );

  hasMoreLogs.current = useMemo(
    () => calculateHasMoreLogs(logLimit, rawComponent, 'logs', hasMoreLogs.current),
    [rawCompLogs]
  );

  hasMoreTagLogs.current = useMemo(
    () => calculateHasMoreLogs(tagLogLimit, rawComponent, 'tagLogs', hasMoreTagLogs.current),
    [rawTags]
  );

  hasMoreSnapLogs.current = useMemo(
    () => calculateHasMoreLogs(snapLogLimit, rawComponent, 'snapLogs', hasMoreSnapLogs.current),
    [rawSnaps]
  );

  const loadMoreLogs = React.useCallback(
    async (backwards = false) => {
      const offset = getOffsetValue(offsetRef.current, logLimit, backwards);

      if (logLimit) {
        await fetchMore({
          variables: {
            logOffset: offset,
          },
          updateQuery: (prev, { fetchMoreResult }) => {
            if (!fetchMoreResult) return prev;

            const prevComponent = prev.getHost.get;
            const fetchedComponent = fetchMoreResult.getHost.get;
            if (fetchedComponent && ComponentID.isEqualObj(prevComponent.id, fetchedComponent.id)) {
              const updatedLogs = mergeLogs(prevComponent.logs, fetchedComponent.logs);
              if (updatedLogs.length > prevComponent.logs.length) {
                offsetRef.current = fetchedComponent.logs.length + offset;
                // @todo account for limit (the API gives the nearest nodes to the limit, not the exact limit)
                hasMoreLogs.current = true;
              }

              return {
                ...prev,
                getHost: {
                  ...prev.getHost,
                  get: {
                    ...prevComponent,
                    logs: updatedLogs,
                  },
                },
              };
            }

            return prev;
          },
        });
      }
    },
    [logLimit, fetchMore]
  );

  const loadMoreTags = React.useCallback(
    async (backwards = false) => {
      const offset = getOffsetValue(tagOffsetRef.current, tagLogLimit, backwards);

      if (tagLogLimit) {
        await fetchMore({
          variables: {
            tagLogOffset: offset,
            tagLogLimit,
          },
          updateQuery: (prev, { fetchMoreResult }) => {
            if (!fetchMoreResult) return prev;

            const prevComponent = prev.getHost.get;
            const fetchedComponent = fetchMoreResult.getHost.get;
            const prevTags = prevComponent.tagLogs;
            const fetchedTags = fetchedComponent.tagLogs ?? [];
            if (fetchedComponent && ComponentID.isEqualObj(prevComponent.id, fetchedComponent.id)) {
              const updatedTags = mergeLogs(prevTags, fetchedTags);
              if (updatedTags.length > prevTags.length) {
                tagOffsetRef.current = fetchedTags.length + offset;
                // @todo account for limit (the API gives the nearest nodes to the limit, not the exact limit)
                hasMoreTagLogs.current = true;
              }

              return {
                ...prev,
                getHost: {
                  ...prev.getHost,
                  get: {
                    ...prevComponent,
                    tagLogs: updatedTags,
                  },
                },
              };
            }

            return prev;
          },
        });
      }
    },
    [tagLogLimit, fetchMore]
  );

  const loadMoreSnaps = React.useCallback(
    async (backwards = false) => {
      const offset = getOffsetValue(snapOffsetRef.current, snapLogLimit, backwards);

      if (snapLogLimit) {
        await fetchMore({
          variables: {
            snapLogOffset: offset,
            snapLogLimit,
          },
          updateQuery: (prev, { fetchMoreResult }) => {
            if (!fetchMoreResult) return prev;

            const prevComponent = prev.getHost.get;
            const prevSnaps = prevComponent.snapLogs ?? [];
            const fetchedComponent = fetchMoreResult.getHost.get;
            const fetchedSnaps = fetchedComponent.snapLogs ?? [];
            if (fetchedComponent && ComponentID.isEqualObj(prevComponent.id, fetchedComponent.id)) {
              const updatedSnaps = mergeLogs(prevSnaps, fetchedSnaps);
              if (updatedSnaps.length > prevSnaps.length) {
                snapOffsetRef.current = fetchedSnaps.length + offset;
                // @todo account for limit (the API gives the nearest nodes to the limit, not the exact limit)
                hasMoreSnapLogs.current = true;
              }

              return {
                ...prev,
                getHost: {
                  ...prev.getHost,
                  get: {
                    ...prevComponent,
                    snapLogs: updatedSnaps,
                  },
                },
              };
            }

            return prev;
          },
        });
      }
    },
    [snapLogLimit, fetchMore]
  );

  useEffect(() => {
    // @TODO @Kutner fix subscription for scope
    if (host !== 'teambit.workspace/workspace') {
      return () => {};
    }

    const unsubAddition = subscribeToMore({
      document: SUB_SUBSCRIPTION_ADDED,
      variables: {
        fetchLogsByTypeSeparately,
      },
      updateQuery: (prev, { subscriptionData }) => {
        const prevComponent = prev?.getHost?.get;
        const addedComponent = subscriptionData?.data?.componentAdded?.component;

        if (!addedComponent || prevComponent) return prev;

        if (idRef.current === addedComponent.id.name) {
          return {
            ...prev,
            getHost: {
              ...prev.getHost,
              get: addedComponent,
            },
          };
        }

        return prev;
      },
    });

    const unsubChanges = subscribeToMore({
      document: SUB_COMPONENT_CHANGED,
      variables: {
        fetchLogsByTypeSeparately,
      },
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;

        const prevComponent = prev?.getHost?.get;
        const updatedComponent = subscriptionData?.data?.componentChanged?.component;

        const isUpdated = updatedComponent && ComponentID.isEqualObj(prevComponent?.id, updatedComponent?.id);

        if (isUpdated) {
          return {
            ...prev,
            getHost: {
              ...prev.getHost,
              get: updatedComponent,
            },
          };
        }

        return prev;
      },
    });

    const unsubRemoval = subscribeToMore({
      document: SUB_COMPONENT_REMOVED,
      variables: {
        fetchLogsByTypeSeparately,
      },
      updateQuery: (prev, { subscriptionData }) => {
        if (!subscriptionData.data) return prev;

        const prevComponent = prev?.getHost?.get;
        const removedIds: ComponentIdObj[] | undefined = subscriptionData?.data?.componentRemoved?.componentIds;
        if (!prevComponent || !removedIds?.length) return prev;

        const isRemoved = removedIds.some((removedId) => ComponentID.isEqualObj(removedId, prevComponent.id));

        if (isRemoved) {
          return {
            ...prev,
            getHost: {
              ...prev.getHost,
              get: null,
            },
          };
        }

        return prev;
      },
    });

    return () => {
      unsubChanges();
      unsubAddition();
      unsubRemoval();
      offsetRef.current = undefined;
    };
  }, []);

  const idDepKey = rawComponent?.id
    ? `${rawComponent?.id?.scope}/${rawComponent?.id?.name}@${rawComponent?.id?.version}}`
    : undefined;

  const id: ComponentID | undefined = useMemo(
    () => (rawComponent ? ComponentID.fromObject(rawComponent.id) : undefined),
    [idDepKey]
  );

  const componentError =
    error && !data ? new ComponentError(500, error.message) : !rawComponent && !loading && new ComponentError(404);

  const component = useMemo(
    () => (rawComponent ? ComponentModel.from({ ...rawComponent, host, logs: rawCompLogs }) : undefined),
    [id?.toString(), rawCompLogs]
  );

  const componentDescriptor = useMemo(() => {
    const aspectList = {
      entries: rawComponent?.aspects.map((aspectObject) => {
        return {
          ...aspectObject,
          aspectId: aspectObject.id,
          aspectData: aspectObject.data,
        };
      }),
    };

    return id ? ComponentDescriptor.fromObject({ id: id.toString(), aspectList }) : undefined;
  }, [id?.toString()]);

  const snaps = useMemo(() => {
    return rawComponent?.snapLogs;
  }, [rawComponent?.snapLogs]);

  const tags = useMemo(() => {
    return rawComponent?.tagLogs;
  }, [rawComponent?.tagLogs]);

  return useMemo(() => {
    return {
      componentDescriptor,
      component,
      componentLogs: {
        loadMoreLogs,
        loadMoreSnaps,
        loadMoreTags,
        hasMoreSnaps: hasMoreSnapLogs.current,
        hasMoreTags: hasMoreTagLogs.current,
        hasMoreLogs: hasMoreLogs.current,
        snaps,
        tags,
      },
      error: componentError || undefined,
      loading,
      ...rest,
    };
  }, [host, component, componentDescriptor, componentError, hasMoreLogs, hasMoreSnapLogs, hasMoreTagLogs, snaps, tags]);
}

interface Log {
  id: string;
  date: string;
}
function mergeLogs(logs1: Log[] = [], logs2: Log[] = []): Log[] {
  const logMap = new Map<string, Log>();
  const result: Log[] = [];

  let index1 = 0;
  let index2 = 0;

  while (index1 < logs1.length && index2 < logs2.length) {
    if (Number(logs1[index1].date) >= Number(logs2[index2].date)) {
      if (!logMap.has(logs1[index1].id)) {
        logMap.set(logs1[index1].id, logs1[index1]);
        result.push(logs1[index1]);
      }
      index1 += 1;
    } else {
      if (!logMap.has(logs2[index2].id)) {
        logMap.set(logs2[index2].id, logs2[index2]);
        result.push(logs2[index2]);
      }
      index2 += 1;
    }
  }

  while (index1 < logs1.length) {
    if (!logMap.has(logs1[index1].id)) {
      logMap.set(logs1[index1].id, logs1[index1]);
      result.push(logs1[index1]);
    }
    index1 += 1;
  }

  while (index2 < logs2.length) {
    if (!logMap.has(logs2[index2].id)) {
      logMap.set(logs2[index2].id, logs2[index2]);
      result.push(logs2[index2]);
    }
    index2 += 1;
  }

  return result;
}
