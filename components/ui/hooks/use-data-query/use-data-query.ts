import { useContext, useEffect } from 'react';
import { useQuery } from '@apollo/client';
import type {
  OperationVariables,
  QueryResult,
  QueryHookOptions,
  DocumentNode,
  ApolloError,
  FetchMoreQueryOptions,
  ApolloQueryResult,
} from '@apollo/client';

import { NotificationContext } from '@teambit/ui-foundation.ui.notifications.notification-context';

export type DataQueryResult<TData = any, TVariables extends OperationVariables = OperationVariables> = Omit<
  QueryResult<TData, TVariables>,
  'data' | 'previousData' | 'fetchMore' | 'refetch'
> & {
  data?: TData | undefined;
  previousData?: TData | undefined;
  fetchMore: (options: FetchMoreQueryOptions<TVariables, TData>) => Promise<ApolloQueryResult<TData>>;
  refetch: (variables?: Partial<TVariables>) => Promise<ApolloQueryResult<TData>>;
};

// Previously this hook also called `useLoader(loading)` from `@teambit/ui-foundation.ui.global-loader`,
// which mutated the root `ClientContext`'s `isLoading` state on every query transition and forced a
// re-render of the entire children subtree. That coupling was removed: each query's loading state now
// stays local to its calling component. The global loader ribbon should subscribe to its own signal
// (e.g. an Apollo link or dedicated hook) instead of inlining itself into every query.
export function useDataQuery<TData = any, TVariables extends OperationVariables = OperationVariables>(
  query: DocumentNode,
  options?: QueryHookOptions<TData, TVariables>
): DataQueryResult {
  const res = useQuery<TData, TVariables>(query, options);
  const notifications = useContext(NotificationContext);
  const { error } = res;

  // Showing a notification mutates the NotificationContext provider's state. Doing it inline during
  // render triggers React's "Cannot update a component while rendering a different component" warning
  // (and an extra render) for every erroring query, so it must run as a post-render effect instead.
  useEffect(() => {
    if (error) {
      notifications.error(apolloErrorToString(error));
    }
  }, [error]);

  return res as DataQueryResult;
}

// @TODO - improve error extraction
function apolloErrorToString(error: ApolloError) {
  return error.toString();
}
