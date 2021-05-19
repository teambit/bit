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

export function useComponent(host: string, id?: ComponentID): Component {
  const {
    // @ts-ignore
    params: { componentId },
  } = useRouteMatch();
  const query = useQuery();
  const version = query.get('version') || undefined;

  const targetId = id || componentId;

  return useComponentQuery(withVersion(targetId, version), host);
}

function withVersion(id: string, version?: string) {
  if (!version) return id;
  return `${id}@${version}`;
}
