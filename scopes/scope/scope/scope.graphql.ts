import { ComponentID } from '@teambit/component';
import { gql } from 'graphql-tag';
import { latestVersions } from '@teambit/legacy.scope-api';
import { LegacyComponentLog as ComponentLog } from '@teambit/legacy-component-log';
import { getBitVersion } from '@teambit/bit.get-bit-version';
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

        # background color of the icon.
        backgroundIconColor: String

        # path of the scope.
        path: String

        # list of components contained in the scope.
        components(offset: Int, limit: Int, includeCache: Boolean, namespaces: [String!]): [Component]

        # get a specific component.
        get(id: String!): Component

        # get serialized legacy component. deprecated. PLEASE DO NOT USE THIS API.
        _getLegacy(id: String!): String

        # get logs.
        getLogs(id: String!): [Log]

        # get many components by ID.
        getMany(ids: [String]!): [Component]

        # filter existing objects in the scope.
        hasObjects(hashes: [String]!): [String]

        # get bit version
        getBitVersion: String

        # get serialized legacy component ids with versions. deprecated. PLEASE DO NOT USE THIS API.
        _legacyLatestVersions(ids: [String]!): [String]
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
        backgroundIconColor: (scope: ScopeMain) => {
          return scope.backgroundIconColor;
        },
        components: (
          scope: ScopeMain,
          props?: { offset: number; limit: number; includeCache?: boolean; namespaces?: string[] }
        ) => {
          if (!props) return scope.list();
          return scope.list({ ...props }, props.includeCache);
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

        getLogs: async (scope: ScopeMain, { id }: { id: string }): Promise<ComponentLog[]> => {
          return scope.getLogs(ComponentID.fromString(id));
        },

        getMany: async (scope: ScopeMain, { ids }: { ids: string[] }) => {
          return scope.getMany(ids.map((str) => ComponentID.fromString(str)));
        },

        hasObjects: async (scope: ScopeMain, { hashes }: { hashes: string[] }) => {
          return scope.hasObjects(hashes);
        },

        getBitVersion: () => {
          return getBitVersion();
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
