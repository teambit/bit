import { useMemo } from 'react';
import { useDataQuery } from '@teambit/ui';
import { GET_GRAPH, RawGraphQuery } from './get-graph.query';
import { GraphModel } from './graph-model';

// TODO - fill int
/** provides data to component ui page, making sure both variables and return value are safely typed and memoized */
export function useGraphQuery(componentId: string[]) {
  const { data, error, loading } = useDataQuery<RawGraphQuery>(GET_GRAPH, {
    variables: { ids: componentId },
  });

  const rawGraph = data?.graph;

  return useMemo(() => {
    return {
      graph: rawGraph ? GraphModel.from(rawGraph) : undefined,
      error: error ? new GraphError(500, error.message) : !rawGraph && !loading ? new GraphError(404) : undefined,
    };
  }, [rawGraph, error]);
}

// TODO
class GraphError {
  constructor(...bla: any) {
    throw new Error('not implemented exception');
  }
}
