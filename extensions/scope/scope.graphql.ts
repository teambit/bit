import { ComponentID } from '@teambit/component';
import gql from 'graphql-tag';

import { ScopeMain } from './scope.main.runtime';

export function scopeSchema(scopeMain: ScopeMain) {
  return {
    typeDefs: gql`
      type Scope {
        # name of the scope.
        name: String

        # path of the scope.
        path: String

        # remove components from the scope.
        # remove(ids: [String], force: Boolean, isLanes: Boolean)

        # list of components contained in the scope.
        components(offset: Int, limit: Int, includeCache: Boolean): [Component]

        # get a specific component.
        get(id: String!): Component

        # get serialized legacy component. deprecated. PLEASE DO NOT USE THIS API.
        _getLegacy(id: String!): String
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

        _getLegacy: async (scope: ScopeMain, { id }: { id: string }) => {
          const component = await scope.get(ComponentID.fromString(id));
          if (!component) return null;
          return component.state._consumer.toString();
        },

        // delete: async (scope: ScopeMain, props: {  }) => {

        // }
      },
      Query: {
        scope: () => scopeMain,
      },
    },
  };
}
