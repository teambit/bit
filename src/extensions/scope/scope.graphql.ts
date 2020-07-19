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
        components: [ComponentMeta]

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
