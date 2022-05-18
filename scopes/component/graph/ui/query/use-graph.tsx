import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import { useGraphQuery } from './use-graph-query';

export function useGraph() {
  const componentId = useQuery().get('componentId') as string;

  return useGraphQuery([componentId]);
}
