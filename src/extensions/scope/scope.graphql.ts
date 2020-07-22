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
