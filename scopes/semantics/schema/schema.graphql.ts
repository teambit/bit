import { ComponentFactory } from '@teambit/component';
import { GraphQLJSONObject } from 'graphql-type-json';
import gql from 'graphql-tag';

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
          const docs = await schema.getSchema(component);
          if (!docs) return empty;

          return docs.toObject();
        },
      },
    },
  };
}
