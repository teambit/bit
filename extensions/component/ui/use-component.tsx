import { useRouteMatch } from 'react-router-dom';

import { ComponentID } from '../id';
import { ComponentModel } from './component-model';
import { ComponentError } from './component-error';
import { useComponentQuery } from './use-component-query';

export type Component = {
  component?: ComponentModel;
  error?: ComponentError;
};

export function useComponent(host: string, id?: ComponentID): Component {
  const {
    params: { componentId },
  } = useRouteMatch();
  const targetId = id || componentId;

  return useComponentQuery(targetId, host);
}
