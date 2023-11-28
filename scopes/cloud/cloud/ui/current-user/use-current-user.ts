import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';

export type CurrentUser = {
  username?: string;
  displayName?: string;
  profileImage?: string;
  isLoggedIn?: boolean;
};

export const CURRENT_USER_QUERY = gql`
  query CurrentUser($redirectUrl: String!) {
    getCurrentUser {
      username
      displayName
      profileImage
      isLoggedIn
    }
    loginUrl(redirectUrl: $redirectUrl)
  }
`;

export function useCurrentUser(): { currentUser?: CurrentUser; loginUrl?: string } {
  const { data } = useDataQuery(CURRENT_USER_QUERY, {
    variables: {
      redirectUrl: window.location.href,
    },
  });
  return {
    currentUser: data?.getCurrentUser,
    loginUrl: data?.loginUrl,
  };
}
