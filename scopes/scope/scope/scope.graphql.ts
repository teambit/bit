import { ComponentID } from '@teambit/component';
import gql from 'graphql-tag';
import { latestVersions } from '@teambit/legacy/dist/api/scope';
import list from '@teambit/legacy/dist/api/scope/lib/scope-list';
import { ScopeMain } from './scope.main.runtime';

export function scopeSchema(scopeMain: ScopeMain) {
  return {
    typeDefs: gql`
      type Scope {
        # name of the scope.
        name: String

        # description of the scope.
        description: String

        # icon of the scope.
        icon: String

        # path of the scope.
        path: String

        # list of components contained in the scope.
        components(offset: Int, limit: Int, includeCache: Boolean): [Component]

        # get a specific component.
        get(id: String!): Component

        # get serialized legacy component. deprecated. PLEASE DO NOT USE THIS API.
        _getLegacy(id: String!): String

        # get logs.
        getLogs(id: String!): [Log]

        # get many components by ID.
        getMany(ids: [String]!): [Component]

        # get serialized legacy component ids with versions. deprecated. PLEASE DO NOT USE THIS API.
        _legacyLatestVersions(ids: [String]!): [String]

        # get serialized list component of components. deprecated. PLEASE DO NOT USE THIS API.
        _legacyList(namespaces: String): [LegacyMeta]
      }

      type Log {
        message: String
        username: String
        email: String
        date: String
        hash: String!
        tag: String
      }

      type LegacyMeta {
        id: String
        deprecated: Boolean
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
        description: (scope: ScopeMain) => {
          return scope.description;
        },
        icon: (scope: ScopeMain) => {
          return scope.icon;
        },
        components: (scope: ScopeMain, props?: { offset: number; limit: number; includeCache?: boolean }) => {
          if (!props) return scope.list();
          return scope.list({ offset: props.offset, limit: props.limit }, props.includeCache);
        },

        get: async (scope: ScopeMain, { id }: { id: string }) => {
          return scope.get(ComponentID.fromString(id));
        },

        _getLegacy: async (scope: ScopeMain, { id }: { id: string }) => {
          const resolvedId = await scope.resolveId(id);
          const component = await scope.get(resolvedId);
          if (!component) return null;
          return component.state._consumer.toString();
        },

        _legacyLatestVersions: async (scope: ScopeMain, { ids }: { ids: string[] }) => {
          return latestVersions(scope.path, ids);
        },

        _legacyList: async (scope: ScopeMain, { namespaces }: { namespaces: string }) => {
          const listData: any = await list(scope.path, namespaces);
          listData.forEach((data) => {
            data.id = data.id.toString();
          });
          return listData;
        },

        getMany: async (scope: ScopeMain, { ids }: { ids: string[] }) => {
          return scope.getMany(ids.map((str) => ComponentID.fromString(str)));
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
