import type { ComponentFactory } from '@teambit/component';
import { GraphQLJSONObject } from 'graphql-type-json';
import { gql } from 'graphql-tag';
import { APISchema, UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import type { Schema } from '@teambit/graphql';
import type { SchemaMain } from './schema.main.runtime';

export function schemaSchema(schema: SchemaMain): Schema {
  return {
    typeDefs: gql`
      scalar JSONObject

      type APIDiffDetail {
        changeKind: String!
        description: String!
        impact: String!
        from: String
        to: String
      }

      type APIDiffChange {
        status: String!
        visibility: String!
        exportName: String!
        schemaType: String!
        schemaTypeRaw: String!
        impact: String!
        baseSignature: String
        compareSignature: String
        baseNode: JSONObject
        compareNode: JSONObject
        changes: [APIDiffDetail!]
      }

      type APIDiffResult {
        hasChanges: Boolean!
        impact: String!
        publicChanges: [APIDiffChange!]!
        internalChanges: [APIDiffChange!]!
        changes: [APIDiffChange!]!
        added: Int!
        removed: Int!
        modified: Int!
        breaking: Int!
        nonBreaking: Int!
        patch: Int!
      }

      extend type ComponentHost {
        getSchema(id: String!, skipInternals: Boolean): JSONObject
        apiDiff(baseId: String!, compareId: String!): APIDiffResult
      }
    `,
    resolvers: {
      JSONObject: GraphQLJSONObject,
      ComponentHost: {
        getSchema: async (host: ComponentFactory, { id, skipInternals }: { id: string; skipInternals?: boolean }) => {
          const componentId = await host.resolveComponentId(id);
          const component = await host.get(componentId);
          const empty = APISchema.empty(componentId).toObject();

          if (!component) return empty;
          const api = await schema.getSchema(component, undefined, undefined, undefined, undefined, skipInternals);
          if (!api) return empty;

          return filterUnimplementedAndAddDefaults(api);
        },
        apiDiff: async (host: ComponentFactory, { baseId, compareId }: { baseId: string; compareId: string }) => {
          const [baseCompId, compareCompId] = await Promise.all([
            host.resolveComponentId(baseId),
            host.resolveComponentId(compareId),
          ]);
          const [baseComp, compareComp] = await Promise.all([host.get(baseCompId), host.get(compareCompId)]);
          if (!baseComp || !compareComp) return null;
          return schema.computeAPIDiff(baseComp, compareComp);
        },
      },
    },
  };
}

function filterUnimplementedAndAddDefaults(api: APISchema) {
  const apiObject = api.toObject();

  const filteredExports = apiObject.module.exports.filter((exp) => {
    if (exp.exportNode) {
      return exp.exportNode.__schema !== UnImplementedSchema.name;
    }
    return (exp as Record<string, any>).__schema !== UnImplementedSchema.name;
  });

  const filteredInternals = apiObject.internals.map((internalObject) => {
    const filteredInternalExports = internalObject.exports.filter((exp) => {
      if (exp.exportNode) {
        return exp.exportNode.__schema !== UnImplementedSchema.name;
      }
      return (exp as Record<string, any>).__schema !== UnImplementedSchema.name;
    });
    const filteredInternalNodes = internalObject.internals.filter((exp) => exp.__schema !== UnImplementedSchema.name);
    return {
      ...internalObject,
      exports: filteredInternalExports,
      internals: filteredInternalNodes,
    };
  });

  const filteredTaggedExports = apiObject.taggedModuleExports.filter(
    (exp) => exp.__schema !== UnImplementedSchema.name
  );

  const defaultTaggedExports = filteredExports
    .filter((exportedModule) => {
      if (exportedModule.exportNode) {
        return exportedModule.exportNode.__schema === 'ReactSchema';
      }
      return (exportedModule as Record<string, any>).__schema === 'ReactSchema';
    })
    .map((exportedModule) => {
      if (exportedModule.exportNode) {
        return exportedModule.exportNode;
      }
      return exportedModule;
    });

  return {
    ...apiObject,
    internals: filteredInternals,
    taggedModuleExports: filteredTaggedExports.length > 0 ? filteredTaggedExports : defaultTaggedExports,
  };
}
