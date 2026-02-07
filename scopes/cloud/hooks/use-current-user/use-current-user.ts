import React from 'react';
import { gql, useQuery, useApolloClient } from '@apollo/client';
import type { CloudUser } from '@teambit/cloud.models.cloud-user';

export const SET_REDIRECT_URL_MUTATION = gql`
  mutation SetRedirectUrl($redirectUrl: String!) {
    setRedirectUrl(redirectUrl: $redirectUrl)
  }
`;

export const CURRENT_USER_QUERY = gql`
  query CurrentUser {
    getCurrentUser {
      username
      displayName
      profileImage
    }
    loginUrl
    isLoggedIn
  }
`;

export function useCurrentUser(): {
  currentUser?: CloudUser;
  loginUrl?: string;
  isLoggedIn?: boolean;
  loading?: boolean;
} {
  const client = useApolloClient();

  // Fire-and-forget: don't block UI rendering. This just sets an in-memory URL on the server.
  React.useEffect(() => {
    const redirectUrl = window.location.href;
    client
      .mutate({ mutation: SET_REDIRECT_URL_MUTATION, variables: { redirectUrl }, fetchPolicy: 'no-cache' })
      .catch(() => {});
  }, [window.location.href]);

  const { data, loading } = useQuery(CURRENT_USER_QUERY, {
    fetchPolicy: 'cache-first',
  });

  return {
    currentUser: {
      username: data?.getCurrentUser?.username ?? undefined,
      displayName: data?.getCurrentUser?.displayName ?? undefined,
      profileImage: data?.getCurrentUser?.profileImage ?? undefined,
      isLoggedIn: data?.isLoggedIn,
    },
    loginUrl: data?.loginUrl,
    isLoggedIn: data?.isLoggedIn,
    loading,
  };
}
