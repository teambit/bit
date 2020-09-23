import { useMemo } from 'react';
import { useDataQuery } from '@teambit/ui';
import { GraphQlError } from '@teambit/graphql';
import { GET_GRAPH, RawGraphQuery } from './get-graph.query';
import { GraphModel } from './graph-model';

/** provides dependencies graph data from graphQL */
export function useGraphQuery(componentId: string[]) {
  const { data, error, loading } = useDataQuery<RawGraphQuery>(GET_GRAPH, {
    variables: { ids: componentId },
  });

  const rawGraph = data?.graph;

  return useMemo(() => {
    return {
      graph: rawGraph ? GraphModel.from(rawGraph) : undefined,
      error: error ? new GraphQlError(500, error.message) : !rawGraph && !loading ? new GraphQlError(404) : undefined,
    };
  }, [rawGraph, error]);
}
