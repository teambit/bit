import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { CloudUser } from '@teambit/cloud.models.cloud-user';

export const CURRENT_USER_QUERY = gql`
  query CurrentUser($redirectUrl: String!) {
    getCurrentUser {
      username
      displayName
      profileImage
    }
    loginUrl(redirectUrl: $redirectUrl)
    isLoggedIn
  }
`;

export function useCurrentUser(): {
  currentUser?: CloudUser;
  loginUrl?: string;
  isLoggedIn?: boolean;
  loading?: boolean;
} {
  const { data, loading } = useDataQuery(CURRENT_USER_QUERY, {
    variables: {
      redirectUrl: window.location.href,
    },
  });
  return {
    currentUser: data?.getCurrentUser,
    loginUrl: data?.loginUrl,
    isLoggedIn: data?.isLoggedIn,
    loading,
  };
}
