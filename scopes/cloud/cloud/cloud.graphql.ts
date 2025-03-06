import { gql } from 'graphql-tag';
import { Schema } from '@teambit/graphql';
import { ScopeDescriptor } from '@teambit/scopes.scope-descriptor';
import { CloudMain } from './cloud.main.runtime';

export function cloudSchema(cloud: CloudMain): Schema {
  return {
    typeDefs: gql`
      type CloudScope {
        id: String!
        icon: String
        backgroundIconColor: String
        stripColor: String
        displayName: String
      }
      type CloudUser {
        displayName: String
        username: String
        profileImage: String
      }
      type Query {
        getCurrentUser: CloudUser
        loginUrl: String!
        getCloudScopes(ids: [String!]): [CloudScope!]
        isLoggedIn: Boolean
      }
      type Mutation {
        logout: Boolean
        setRedirectUrl(redirectUrl: String!): Boolean
      }
    `,
    resolvers: {
      CloudScope: {
        id: (scope?: ScopeDescriptor) => {
          return scope?.id.toString();
        },
      },
      Query: {
        isLoggedIn: () => {
          return cloud.isLoggedIn();
        },
        loginUrl: () => {
          return cloud.getLoginUrl();
        },
        getCurrentUser: async () => {
          const user = await cloud.getCurrentUser();
          return {
            ...user,
          };
        },
        getCloudScopes: async (_, { ids }) => {
          const scopes = await cloud.getCloudScopes(ids);
          return scopes;
        },
      },
      Mutation: {
        logout: async () => {
          await cloud.logout();
          return true;
        },
        setRedirectUrl: async (_, { redirectUrl }: { redirectUrl: string }) => {
          cloud.setRedirectUrl(redirectUrl);
          return true;
        },
      },
    },
  };
}
