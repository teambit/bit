import { useContext } from 'react';
import { ApolloError } from 'apollo-client';
import { useQuery, QueryHookOptions } from '@apollo/react-hooks';
import { OperationVariables, QueryResult } from '@apollo/react-common';
import { DocumentNode } from 'graphql';
import { useLoader } from '../global-loader';
import { NotificationContext } from '../../../notifications/ui';

// @TODO derive props from useQuery
// (couldn't figure out how to use Parameters<typeof useQuery<..>>)

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
