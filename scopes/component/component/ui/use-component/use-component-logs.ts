import React, { useMemo, useRef } from 'react';
import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { ComponentID } from '@teambit/component-id';
import { calculateHasMoreLogs, calculateNewOffset, getOffsetValue, mergeLogs } from './use-component.utils';
import { ComponentLogsResult, Filters } from './use-component.model';
import { GET_COMPONENT_WITH_LOGS } from './use-component.fragments';
import { ComponentError } from '../component-error';

export function useComponentLogs(
  componentId: string,
  host: string,
  filters?: Filters,
  skipFromProps?: boolean
): ComponentLogsResult {
  const {
    logLimit,
    offsetRef,
    hasMoreLogs,
    tagOffsetRef,
    snapOffsetRef,
    hasMoreTagLogs,
    hasMoreSnapLogs,
    snapLogLimit,
    tagLogLimit,
    logOffset,
    tagLogOffset,
    snapLogOffset,
    fetchLogsByTypeSeparately,
    variables,
    skip,
  } = useComponentLogsInit(componentId, host, filters, skipFromProps);

  const { data, error, loading, fetchMore } = useDataQuery(GET_COMPONENT_WITH_LOGS, {
    variables,
    skip,
    errorPolicy: 'all',
  });

  const rawComponent = data?.getHost?.get;
  const rawTags: Array<LegacyComponentLog> = rawComponent?.tagLogs ?? [];
  const rawSnaps: Array<LegacyComponentLog> = rawComponent?.snapLogs ?? [];
  const rawCompLogs: Array<LegacyComponentLog> = rawComponent?.logs ?? mergeLogs(rawTags, rawSnaps);

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

  const componentError =
    error && !data
      ? new ComponentError(500, error.message)
      : (!rawComponent && !loading && new ComponentError(404)) || undefined;

  const idDepKey = rawComponent?.id
    ? `${rawComponent?.id?.scope}/${rawComponent?.id?.name}@${rawComponent?.id?.version}}`
    : undefined;

  const id: ComponentID | undefined = useMemo(
    () => (rawComponent ? ComponentID.fromObject(rawComponent.id) : undefined),
    [idDepKey]
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

  return {
    componentDescriptor,
    loading,
    error: componentError,
    componentLogs: {
      logs: rawCompLogs,
      snaps: rawSnaps,
      tags: rawTags,
      hasMoreLogs: hasMoreLogs.current,
      hasMoreTags: hasMoreTagLogs.current,
      hasMoreSnaps: hasMoreSnapLogs.current,
      loadMoreLogs,
      loadMoreTags,
      loadMoreSnaps,
      loading,
    },
  };
}

export function useComponentLogsInit(componentId: string, host: string, filters?: Filters, skip?: boolean) {
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
  return {
    logOffset,
    variables,
    offsetRef,
    tagOffsetRef,
    snapOffsetRef,
    hasMoreLogs,
    hasMoreTagLogs,
    hasMoreSnapLogs,
    logLimit,
    snapLogLimit,
    tagLogLimit,
    fetchLogsByTypeSeparately,
    tagLogOffset,
    snapLogOffset,
    skip,
  };
}
