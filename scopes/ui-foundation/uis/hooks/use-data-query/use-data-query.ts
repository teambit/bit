import { useContext } from 'react';
import { useQuery } from '@apollo/client';
import type { OperationVariables, QueryResult, QueryHookOptions, DocumentNode, ApolloError } from '@apollo/client';

import { NotificationContext } from '@teambit/ui-foundation.ui.notifications.notification-context';

import { useLoader } from '@teambit/ui-foundation.ui.global-loader';

// @TODO derive props from useQuery
// (couldn't figure out how to use Parameters<typeof useQuery<..>>)

export type DataQueryResult<TData = any, TVariables = OperationVariables> = QueryResult<TData, TVariables>;

export function useDataQuery<TData = any, TVariables = OperationVariables>(
  query: DocumentNode,
  options?: QueryHookOptions<TData, TVariables>
): QueryResult<TData, TVariables> {
  const res = useQuery(query, options);
  const notifications = useContext(NotificationContext);

  const { loading, error } = res;
  useLoader(loading);

  if (error) {
    notifications.error(apolloErrorToString(error));
  }

  return res;
}

// @TODO - improve error extraction
function apolloErrorToString(error: ApolloError) {
  return error.toString();
}
