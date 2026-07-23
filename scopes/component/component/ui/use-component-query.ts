import { useMemo, useRef } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentID } from '@teambit/component-id';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { ComponentModel } from './component-model';
import type { ComponentQueryResult, Filters } from './use-component.model';
import { GET_COMPONENT } from './use-component.fragments';
import { useComponentLogs } from './use-component-logs';
import { ComponentError } from './component-error';

/**
 * provides data to component ui page, making sure both variables and return value are safely typed and memoized.
 *
 * Logs are fetched separately and opt-in via `useComponentLogs` (gated by `filters.log`), so views
 * that don't render snap history (lane-compare, bulk panels) don't pay for the expensive logs query.
 */
export function useComponentQuery(
  componentId: string,
  host: string,
  filters?: Filters,
  skip?: boolean,
  context?: Record<string, any>
): ComponentQueryResult {
  const idRef = useRef(componentId);
  idRef.current = componentId;
  const variables = {
    id: componentId,
    extensionId: host,
  };

  const { data, error, loading } = useDataQuery(GET_COMPONENT, {
    variables,
    skip,
    errorPolicy: 'all',
    context,
  });

  // Only fetch logs when a log filter is explicitly provided — most callers (lane-compare,
  // bulk component panels) never look at history, so the per-component logs query was firing
  // for nothing. Pages that need the history panel pass `filters: { log: {...} }` and
  // `useComponentLogs` runs as before.
  const wantsLogs = !!filters?.log;
  const { loading: loadingLogs, componentLogs: { logs } = {} } = useComponentLogs(
    componentId,
    host,
    filters,
    skip || !wantsLogs,
    context
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
    [id?.toString(), logs]
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
  }, [host, component, componentDescriptor, componentError]);
}
