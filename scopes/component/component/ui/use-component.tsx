import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';
import { Filters, useComponentQuery } from './use-component-query';

export type Component = {
  component?: ComponentModel;
  error?: ComponentError;
  componentDescriptor?: ComponentDescriptor;
  loading?: boolean;
};
export type UseComponentOptions = {
  version?: string;
  logFilters?: Filters;
  customUseComponent?: UseComponentType;
  skip?: boolean;
};

export type UseComponentType = (id: string, host: string, filters?: Filters, skip?: boolean) => Component;

export function useComponent(host: string, id?: string, options?: UseComponentOptions): Component {
  const query = useQuery();
  const { version, logFilters, customUseComponent, skip } = options || {};
  const componentVersion = (version || query.get('version')) ?? undefined;

  if (!id) throw new TypeError('useComponent received no component id');

  const componentIdStr = withVersion(id, componentVersion);
  const targetUseComponent = customUseComponent || useComponentQuery;

  return targetUseComponent(componentIdStr, host, logFilters, skip);
}

function withVersion(id: string, version?: string) {
  if (!version) return id;
  if (id.includes('@')) return id;
  return `${id}@${version}`;
}
