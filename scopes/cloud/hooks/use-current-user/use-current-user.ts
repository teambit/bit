import { useQuery as useDataQuery, DocumentNode } from '@apollo/client';
import { gql } from 'graphql-tag';
import { CloudUser } from '@teambit/cloud.models.cloud-user';

export const CURRENT_USER_QUERY: DocumentNode = gql`
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
