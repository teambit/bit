import { ComponentFactory } from '@teambit/component';
import gql from 'graphql-tag';

import { SchemaMain } from './schema.main.runtime';

export function schemaSchema(schema: SchemaMain) {
  return {
    typeDefs: gql`
      extend type ComponentHost {
        getSchema(id: String!): SchemaDocs
      }

      type SchemaDocs {
        exports: [String]
      }
    `,
    resolvers: {
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

          return docs;
        },
      },
    },
  };
}
