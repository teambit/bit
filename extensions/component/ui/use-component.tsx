import { useRouteMatch } from 'react-router-dom';

import { ComponentID } from '../id';
import { ComponentModel } from './component-model';
import { useComponentQuery } from './use-component-query';

export function useComponent(host: string, id?: ComponentID): ComponentModel | undefined {
  const {
    params: { componentId },
  } = useRouteMatch();
  const targetId = id || componentId;

  return useComponentQuery(targetId, host);
}
