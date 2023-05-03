import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { ComponentQueryResult, Filters, useComponentQuery } from './use-component-query';

export type UseComponentOptions = {
  version?: string;
  logFilters?: Filters;
  customUseComponent?: UseComponentType;
  skip?: boolean;
};

export type UseComponentType = (id: string, host: string, filters?: Filters, skip?: boolean) => ComponentQueryResult;

export function useComponent(host: string, id?: string, options?: UseComponentOptions): ComponentQueryResult {
  const query = useQuery();
  const { version, logFilters, customUseComponent, skip } = options || {};
  const componentVersion = (version || query.get('version')) ?? undefined;

  const componentIdStr = id && withVersion(id, componentVersion);
  const targetUseComponent = customUseComponent || useComponentQuery;

  return targetUseComponent(componentIdStr || '', host, logFilters, skip || !id);
}

function withVersion(id: string, version?: string) {
  if (!version) return id;
  if (id.includes('@')) return id;
  return `${id}@${version}`;
}
