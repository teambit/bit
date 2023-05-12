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
    loadMoreLogs?: (backwards?: boolean) => void;
    loadMoreTags?: (backwards?: boolean) => void;
    loadMoreSnaps?: (backwards?: boolean) => void;
    snaps?: LegacyComponentLog[];
    tags?: LegacyComponentLog[];
  };
  loading?: boolean;
  error?: ComponentError;
};
function getOffsetValue(offset, limit) {
  if (offset !== undefined) {
    return offset;
  }
  if (limit !== undefined) {
    return 0;
  }
  return undefined;
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
    logOffset: logOffset ?? logLimit ? 0 : undefined,
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
  const rawTags = rawComponent?.tagLogs ?? [];
  const rawSnaps = rawComponent?.snapLogs ?? [];
  const rawCompLogs = rawComponent?.logs ?? mergeLogs(rawTags, rawSnaps);
  offsetRef.current = useMemo(() => {
    const currentOffset = offsetRef.current;
    if (!currentOffset) return rawCompLogs.length;
    return offsetRef.current;
  }, [rawCompLogs]);

  tagOffsetRef.current = useMemo(() => {
    if (!fetchLogsByTypeSeparately) return offsetRef.current;
    const currentOffset = tagOffsetRef.current;
    if (!currentOffset) return rawTags.length;
    return tagOffsetRef.current;
  }, [rawCompLogs]);

  snapOffsetRef.current = useMemo(() => {
    if (!fetchLogsByTypeSeparately) return offsetRef.current;
    const currentOffset = snapOffsetRef.current;
    if (!currentOffset) return rawSnaps.length;
    return snapOffsetRef.current;
  }, [rawSnaps]);

  hasMoreLogs.current = useMemo(() => {
    if (!logLimit) return false;
    if (rawComponent === undefined) return undefined;
    if (hasMoreLogs.current === undefined) return rawComponent?.logs.length >= logLimit;
    return hasMoreLogs.current;
  }, [rawCompLogs]);

  hasMoreTagLogs.current = useMemo(() => {
    if (!tagLogLimit) return false;
    if (rawComponent === undefined) return undefined;
    if (hasMoreTagLogs.current === undefined) return rawComponent?.tagLogs.length >= tagLogLimit;
    return hasMoreTagLogs.current;
  }, [rawTags]);

  hasMoreSnapLogs.current = useMemo(() => {
    if (!snapLogLimit) return false;
    if (rawComponent === undefined) return undefined;
    if (hasMoreSnapLogs.current === undefined) return rawComponent?.snapLogs.length === snapLogLimit;
    return hasMoreSnapLogs.current;
  }, [rawSnaps]);

  const loadMoreLogs = React.useCallback(
    async (backwards = false) => {
      const offset = offsetRef.current ? (backwards && -offsetRef.current) || offsetRef.current : undefined;

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
              hasMoreLogs.current = fetchedComponent.logs.length >= logLimit;
              if (updatedLogs.length > prevComponent.logs.length) {
                offsetRef.current = updatedLogs.length;
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
      const offset = tagOffsetRef.current ? (backwards && -tagOffsetRef.current) || tagOffsetRef.current : undefined;

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
            const prevCompLogs = prevComponent.tagLogs;
            if (fetchedComponent && ComponentID.isEqualObj(prevComponent.id, fetchedComponent.id)) {
              const updatedTags = mergeLogs(prevCompLogs, fetchedComponent.tagLogs);
              if (updatedTags.length > prevCompLogs.length) {
                tagOffsetRef.current = updatedTags.length;
              }
              hasMoreTagLogs.current = fetchedComponent.tagLogs.length >= tagLogLimit;
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
      const offset = snapOffsetRef.current ? (backwards && -snapOffsetRef.current) || snapOffsetRef.current : undefined;

      if (snapLogLimit) {
        await fetchMore({
          variables: {
            snapLogOffset: offset,
            snapLogLimit,
          },
          updateQuery: (prev, { fetchMoreResult }) => {
            if (!fetchMoreResult) return prev;

            const prevComponent = prev.getHost.get;
            const prevCompLogs = prevComponent.snapLogs ?? [];

            const fetchedComponent = fetchMoreResult.getHost.get;
            if (fetchedComponent && ComponentID.isEqualObj(prevComponent.id, fetchedComponent.id)) {
              const updatedSnaps = mergeLogs(prevCompLogs, fetchedComponent.snapLogs);
              if (updatedSnaps.length > prevCompLogs.length) {
                snapOffsetRef.current = updatedSnaps.length;
              }
              hasMoreSnapLogs.current = fetchedComponent.snapLogs.length >= snapLogLimit;
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
  const mergedLogs: Log[] = [];
  logs1.forEach((log) => mergedLogs.push(log));
  logs2.forEach((log) => mergedLogs.push(log));
  return mergedLogs;
}
