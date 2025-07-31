import { useMemo, useEffect, useState } from 'react';
import { useQuery, useLazyQuery } from '@apollo/client';
import { GraphQlError } from '@teambit/graphql';
import type { RawGraphQuery } from './get-graph.query';
import { GET_GRAPH, GET_GRAPH_IDS } from './get-graph.query';
import { GraphModel } from './graph-model';

type QueryVariables = {
  ids?: string[];
  filter?: string;
};

export function useGraphQuery(componentId?: string[], filter?: string) {
  // Eagerly fetch GET_GRAPH_IDS
  const {
    data: idsData,
    error: idsError,
    loading: idsLoading,
  } = useQuery<RawGraphQuery, QueryVariables>(GET_GRAPH_IDS, {
    variables: { ids: componentId, filter },
    skip: !componentId || !filter,
  });

  // Lazily fetch GET_GRAPH
  const [getGraph, { data: graphData, error: graphError, loading: graphLoading }] = useLazyQuery<
    RawGraphQuery,
    QueryVariables
  >(GET_GRAPH);

  const [fetchError, setFetchError] = useState<GraphQlError | undefined>(undefined);

  const [shouldRefetchGraph, setShouldRefetchGraph] = useState(false);

  useEffect(() => {
    if (idsData?.graph.nodes.length || !filter) {
      setShouldRefetchGraph(true);
    }
  }, [idsData?.graph.nodes.length, filter]);

  useEffect(() => {
    if (shouldRefetchGraph) {
      setShouldRefetchGraph(false);
      void getGraph({ variables: { ids: componentId, filter } }).catch((error) => {
        setFetchError(new GraphQlError(500, error.message));
      });
    }
  }, [componentId, filter, getGraph, shouldRefetchGraph]);

  const rawGraph = idsLoading
    ? undefined
    : (idsData?.graph &&
        graphData?.graph &&
        idsData?.graph.nodes.length === graphData?.graph.nodes.length &&
        graphData?.graph) ||
      idsData?.graph ||
      graphData?.graph;

  const clientError = !rawGraph && !idsLoading && !graphLoading ? new GraphQlError(404) : undefined;
  const serverError =
    graphError?.message || idsError?.message
      ? new GraphQlError(500, graphError?.message || idsError?.message)
      : fetchError;

  return useMemo(() => {
    return {
      graph: rawGraph ? GraphModel.from(rawGraph) : undefined,
      error: serverError || clientError,
      loading: idsLoading || graphLoading,
      idsLoading,
      graphLoading,
    };
  }, [rawGraph, serverError, clientError, idsLoading, graphLoading]);
}
