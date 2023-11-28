import gql from 'graphql-tag';
import { Schema } from '@teambit/graphql';
import { Component } from '@teambit/component';
import { CloudMain } from './cloud.main.runtime';

export function cloudSchema(cloud: CloudMain): Schema {
  return {
    typeDefs: gql`
      type BitCloudScope {
        name: String
        icon: String
      }
      type BitCloudUser {
        displayName: String
        username: String
        profileImage: String
        isLoggedIn: Boolean
      }
      type Query {
        getCurrentUser: BitCloudUser
        loginUrl(redirectUrl: String!): String!
      }
      extend type Component {
        scope: BitCloudScope
      }
    `,
    resolvers: {
      Component: {
        scope: async (component: Component) => {
          const scope = await cloud.getScope();
          return {
            ...scope,
          };
        },
      },
      BitCloudUser: {
        isLoggedIn: () => {
          return CloudMain.isLoggedIn();
        },
      },
      Query: {
        loginUrl: (_, { redirectUrl }) => {
          return cloud.getLoginUrl(redirectUrl);
        },
        getCurrentUser: async () => {
          const user = await cloud.getCurrentUser();
          return {
            ...user,
          };
        },
      },
    },
  };
}
