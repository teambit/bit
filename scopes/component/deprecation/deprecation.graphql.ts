import { Component } from '@teambit/component';
import { Schema, Verb } from '@teambit/graphql';
import gql from 'graphql-tag';

import { DeprecationMain } from './deprecation.main.runtime';

export function deprecationSchema(deprecation: DeprecationMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        deprecation: DeprecationInfo
      }

      type DeprecationInfo {
        isDeprecate: Boolean
      }

      type Mutation {
        # deprecate components
        deprecate(bitIds: [String!]!): Boolean

        # undo deprecate to components
        undeprecate(bitIds: [String!]!): Boolean
      }
    `,
    resolvers: {
      Mutation: {
        deprecate: (req: any, { bitIds }: { bitIds: string[] }, context: { verb: Verb }) => {
          if (context.verb !== Verb.WRITE) throw new Error('You are not authorized');
          return deprecation.deprecate(bitIds);
        },

        undeprecate: (req: any, { bitIds }: { bitIds: string[] }, context: { verb: Verb }) => {
          if (context.verb !== Verb.WRITE) throw new Error('You are not authorized');
          return deprecation.unDeprecate(bitIds);
        },
      },
      Component: {
        deprecation: (component: Component) => {
          return deprecation.getDeprecationInfo(component);
        },
      },
    },
  };
}
