import { useQuery, QueryHookOptions } from '@apollo/react-hooks';
import { OperationVariables, QueryResult } from '@apollo/react-common';
import { DocumentNode } from 'graphql';
import { useLoader } from '../global-loader';

// @TODO derive props from useQuery
// (couldn't figure out how to use Parameters<typeof useQuery<..>>)

export function useDataQuery<TData = any, TVariables = OperationVariables>(
  query: DocumentNode,
  options?: QueryHookOptions<TData, TVariables>
): QueryResult<TData, TVariables> {
  const res = useQuery(query, options);

  const { loading, error } = res;
  useLoader(loading);
  // eslint-disable-next-line no-console
  if (error) console.error(error); // WIP

  return res;
}
