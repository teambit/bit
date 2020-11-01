import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import gql from 'graphql-tag';

import { CompositionsMain } from './compositions.main.runtime';

export function compositionsSchema(compositions: CompositionsMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        compositions: [Composition]
      }

      type Subscription {
        compositionAdded: Composition
      }

      type Composition {
        filepath: String
        identifier: String
      }
    `,
    resolvers: {
      Component: {
        compositions: (component: Component) => {
          return compositions.getCompositions(component);
        },
      },
    },
  };
}
