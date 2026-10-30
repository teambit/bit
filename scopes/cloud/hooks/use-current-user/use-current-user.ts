import React from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { useMutation, gql } from '@apollo/client';
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
  const [setRedirectUrl] = useMutation(SET_REDIRECT_URL_MUTATION);

  // read the href during render rather than inside the dependency array: a dependency array is
  // evaluated on every render, including the server-side one, where `window` does not exist. the
  // effect body itself never runs on the server, so only the dependency needed guarding.
  const redirectUrl = typeof window === 'undefined' ? undefined : window.location.href;

  React.useEffect(() => {
    if (!redirectUrl) return;
    setRedirectUrl({ variables: { redirectUrl } }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error setting redirect URL:', error);
    });
  }, [redirectUrl]);

  const { data, loading } = useDataQuery(CURRENT_USER_QUERY, {
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
