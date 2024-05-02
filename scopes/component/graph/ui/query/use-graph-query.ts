import { useMemo } from 'react';
import { useQuery as useDataQuery } from '@apollo/client';
import { GraphQlError } from '@teambit/graphql';
import { GET_GRAPH } from './get-graph.query';
import { GraphModel } from './graph-model';

/** provides dependencies graph data from graphQL */
export function useGraphQuery(componentId?: string[], filter?: string) {
  const { data, error, loading } = useDataQuery(GET_GRAPH, {
    variables: { ids: componentId, filter },
    skip: !componentId,
  });

  const rawGraph = data?.graph;
  const clientError = !rawGraph && !loading ? new GraphQlError(404) : undefined;
  const serverError = error ? new GraphQlError(500, error.message) : undefined;

  return useMemo(() => {
    return {
      graph: rawGraph ? GraphModel.from(rawGraph) : undefined,
      error: serverError || clientError,
      loading,
    };
  }, [rawGraph, error]);
}
