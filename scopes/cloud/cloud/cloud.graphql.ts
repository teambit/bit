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
        loginUrl(redirectUrl: String!): String!
        getCloudScopes(ids: [String!]): [CloudScope!]
        isLoggedIn: Boolean
      }
      type Mutation {
        logout: Boolean
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
        loginUrl: (_, { redirectUrl }: { redirectUrl?: string }) => {
          return cloud.getLoginUrl({ redirectUrl });
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
          cloud.logout();
          return true;
        },
      },
    },
  };
}
