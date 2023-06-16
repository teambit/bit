import { LegacyComponentLog } from '@teambit/legacy-component-log';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { ComponentLogsResult, Filters } from './use-component.model';
import { GET_COMPONENT_WITH_LOGS } from './use-component.fragments';
import { ComponentError } from './component-error';
import { getOffsetValue } from './use-component.utils';

export function useComponentLogs(
  componentId: string,
  host: string,
  filters?: Filters,
  skipFromProps?: boolean
): ComponentLogsResult {
  const { variables, skip } = useComponentLogsInit(componentId, host, filters, skipFromProps);

  const { data, error, loading } = useDataQuery(GET_COMPONENT_WITH_LOGS, {
    variables,
    skip,
    errorPolicy: 'all',
  });

  const rawComponent = data?.getHost?.get;
  const rawCompLogs: Array<LegacyComponentLog> = rawComponent?.logs;

  const componentError =
    error && !data
      ? new ComponentError(500, error.message)
      : (!rawComponent && !loading && new ComponentError(404)) || undefined;

  return {
    loading,
    error: componentError,
    componentLogs: {
      logs: rawCompLogs,
      loading,
    },
  };
}

export function useComponentLogsInit(componentId: string, host: string, filters?: Filters, skip?: boolean) {
  const { log } = filters || {};
  const {
    head: logHead,
    offset: logOffset,
    sort: logSort,
    limit: logLimit,
    type: logType,
    takeHeadFromComponent: logTakeHeadFromComponent,
  } = log || {};
  const variables = {
    id: componentId,
    extensionId: host,
    logOffset: getOffsetValue(logOffset, logLimit),
    logLimit,
    logType,
    logHead,
    logSort,
    logTakeHeadFromComponent,
  };
  return {
    logOffset,
    variables,
    skip,
  };
}
