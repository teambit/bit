import { ComponentFactory } from '@teambit/component';
import { GraphQLJSONObject } from 'graphql-type-json';
import gql from 'graphql-tag';
import { APISchema, UnImplementedSchema } from '@teambit/semantics.entities.semantic-schema';

import { SchemaMain } from './schema.main.runtime';

export function schemaSchema(schema: SchemaMain) {
  return {
    typeDefs: gql`
      scalar JSONObject
      extend type ComponentHost {
        getSchema(id: String!): JSONObject
      }
    `,
    resolvers: {
      JSONObject: GraphQLJSONObject,
      ComponentHost: {
        getSchema: async (host: ComponentFactory, { id }: { id: string }) => {
          const componentId = await host.resolveComponentId(id);
          const component = await host.get(componentId);
          const empty = {
            exports: [],
          };

          if (!component) return empty;
          const api = await schema.getSchema(component);
          if (!api) return empty;

          return filterUnimplementedSchemaNodes(api);
        },
      },
    },
  };
}

function filterUnimplementedSchemaNodes(api: APISchema) {
  const apiObject = api.toObject();
  const filteredExports = apiObject.module.exports.filter((exp) => exp.__schema !== UnImplementedSchema.name);
  const filteredInternals = apiObject.internals.map((internalObject) => {
    const filteredInternalExports = internalObject.exports.filter((exp) => exp.__schema !== UnImplementedSchema.name);
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
  return {
    ...apiObject,
    exports: filteredExports,
    internals: filteredInternals,
    taggedModuleExports: filteredTaggedExports,
  };
}
