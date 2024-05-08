import { ComponentFactory } from '@teambit/component';
import { GraphQLJSONObject } from 'graphql-type-json';
import { gql } from 'graphql-tag';
import { APISchema, UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';
import { Schema } from '@teambit/graphql';
import { SchemaMain } from './schema.main.runtime';

export function schemaSchema(schema: SchemaMain): Schema {
  return {
    typeDefs: gql`
      scalar JSONObject
      extend type ComponentHost {
        getSchema(id: String!, skipInternals: Boolean): JSONObject
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
