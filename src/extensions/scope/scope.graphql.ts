import gql from 'graphql-tag';
import { ScopeExtension } from './scope.extension';

export function scopeSchema(scopeExtension: ScopeExtension) {
  return {
    typeDef: gql`
      type Scope {
        # name of the scope.
        name: String

        # path of the scope.
        path: String

        # list of components contained in the scope.
        components: [Component]

        # get a specific component.
        get(id: String!): Component
      }

      type Query {
        scope: Scope
      }
    `,
    resolvers: {
      Scope: {
        name: (scope: ScopeExtension) => scope.name,
        components: (scope: ScopeExtension) => scope.list(),
      },
      Query: {
        scope: () => scopeExtension,
      },
    },
  };
}
