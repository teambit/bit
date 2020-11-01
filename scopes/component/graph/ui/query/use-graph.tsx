import { useRouteMatch } from 'react-router-dom';

import { useGraphQuery } from './use-graph-query';

export function useGraph() {
  const {
    params: { componentId },
  } = useRouteMatch();

  return useGraphQuery([componentId]);
}

export {};
