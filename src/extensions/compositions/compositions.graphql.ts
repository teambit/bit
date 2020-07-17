import { Schema } from '../graphql';
import { CompositionsExtension } from './compositions.extension';
import { Component } from '../component';

export function compositionsSchema(compositions: CompositionsExtension): Schema {
  return {
    typeDefs: `
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
