import { useRouteMatch } from 'react-router-dom';
import { ComponentID } from '@teambit/component-id';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';
import { useComponentQuery } from './use-component-query';

export type Component = {
  component?: ComponentModel;
  error?: ComponentError;
};

type ComponentRoute = {
  componentId?: string;
};

export function useComponent(host: string, id?: ComponentID): Component {
  const {
    params: { componentId },
  } = useRouteMatch<ComponentRoute>();
  const query = useQuery();
  const version = query.get('version') || undefined;

  const targetId = id?.toString({ ignoreVersion: true }) || componentId;
  if (!targetId) throw new TypeError('useComponent received no component id');

  return useComponentQuery(withVersion(targetId, version), host);
}

function withVersion(id: string, version?: string) {
  if (!version) return id;
  if (id.includes('@')) return id;
  return `${id}@${version}`;
}
