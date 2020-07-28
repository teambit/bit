import gql from 'graphql-tag';
import { ScopeExtension } from './scope.extension';
import { ComponentID } from '../component';

export function scopeSchema(scopeExtension: ScopeExtension) {
  return {
    typeDefs: gql`
      type Scope {
        # name of the scope.
        name: String

        # path of the scope.
        path: String

        # list of components contained in the scope.
        components(offset: Int, limit: Int): [Component]

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
        components: (scope: ScopeExtension, filter?: { offset: number; limit: number }) => scope.list(filter),
        get: async (scope: ScopeExtension, { id }: { id: string }) => {
          return scope.get(ComponentID.fromString(id));
        },
      },
      Query: {
        scope: () => scopeExtension,
      },
    },
  };
}
