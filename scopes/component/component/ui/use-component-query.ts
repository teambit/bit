import { useMemo, useRef } from 'react';
import { useQuery } from '@apollo/client';
import { ComponentID } from '@teambit/component-id';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { ComponentModel } from './component-model';
import type { ComponentQueryResult, Filters } from './use-component.model';
import { GET_COMPONENT } from './use-component.fragments';
import { useComponentLogs } from './use-component-logs';
import { ComponentError } from './component-error';

/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useComponentQuery(
  componentId: string,
  host: string,
  filters?: Filters,
  skip?: boolean
): ComponentQueryResult {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  const variables = {
    id: componentId,
    extensionId: host,
  };

  // Use useQuery directly to avoid global loader side effects from useDataQuery.
  // cache-and-network gives instant cache hydration, then reconciles with current server data.
  const { data, error, loading } = useQuery(GET_COMPONENT, {
    variables,
    skip,
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
    nextFetchPolicy: 'cache-first',
    returnPartialData: true,
    notifyOnNetworkStatusChange: false,
    context: { skipBatch: true },
  });

  const shouldFetchLogs = !!filters?.log && !filters?.loading;
  const { loading: loadingLogs, componentLogs: { logs } = {} } = useComponentLogs(
    componentId,
    host,
    filters,
    skip || !shouldFetchLogs
  );

  const rawComponent = data?.getHost?.get;

  const idDepKey = rawComponent?.id
    ? `${rawComponent?.id?.scope}/${rawComponent?.id?.name}@${rawComponent?.id?.version}}`
    : undefined;

  const id: ComponentID | undefined = useMemo(
    () => (rawComponent ? ComponentID.fromObject(rawComponent.id) : undefined),
    [idDepKey]
  );

  const componentError =
    error && !data
      ? new ComponentError(500, error.message)
      : (!rawComponent && !loading && new ComponentError(404)) || undefined;

  const component = useMemo(
    () => (rawComponent ? ComponentModel.from({ ...rawComponent, host, logs }) : undefined),
    [id?.toString(), logs, rawComponent, host]
  );

  const componentDescriptor = useMemo(() => {
    const aspectList = {
      entries: (rawComponent?.aspects || []).map((aspectObject) => {
        return {
          ...aspectObject,
          aspectId: aspectObject.id,
          aspectData: aspectObject.data,
        };
      }),
    };

    return id ? ComponentDescriptor.fromObject({ id: id.toString(), aspectList }) : undefined;
  }, [id?.toString(), rawComponent?.aspects]);

  return useMemo(() => {
    return {
      componentDescriptor,
      component,
      componentLogs: {
        loading: loadingLogs,
        logs,
      },
      error: componentError || undefined,
      loading,
    };
  }, [component, componentDescriptor, componentError, loading, loadingLogs, logs]);
}
