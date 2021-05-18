import { useMemo } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { GraphQlError } from '@teambit/graphql';
import { GET_GRAPH, RawGraphQuery } from './get-graph.query';
import { GraphModel } from './graph-model';

type QueryVariables = {
  ids: string[];
  filter?: string;
};

/** provides dependencies graph data from graphQL */
export function useGraphQuery(componentId: string[], filter?: string) {
  const { data, error, loading } = useDataQuery<RawGraphQuery, QueryVariables>(GET_GRAPH, {
    variables: { ids: componentId, filter },
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
