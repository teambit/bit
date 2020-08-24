import { ComponentID } from '@teambit/component';
import gql from 'graphql-tag';

import { ScopeMain } from './scope.main.runtime';

export function scopeSchema() {
  return {
    typeDefs: gql`
      type Scope {
        # name of the scope.
        name: String

        # path of the scope.
        path: String

        # list of components contained in the scope.
        components(offset: Int, limit: Int, includeCache: Boolean): [Component]

        # get a specific component.
        get(id: String!): Component
      }

      type Query {
        scope: Scope
      }
    `,
    resolvers: {
      Scope: {
        name: (scope: ScopeMain) => {
          return scope.name;
        },
        components: (scope: ScopeMain, props?: { offset: number; limit: number; includeCache?: boolean }) => {
          if (!props) return scope.list();
          return scope.list({ offset: props.offset, limit: props.limit }, props.includeCache);
        },
        get: async (scope: ScopeMain, { id }: { id: string }) => {
          return scope.get(ComponentID.fromString(id));
        },
      },
      Query: {
        scope: () => ScopeMain,
      },
    },
  };
}
