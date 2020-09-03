import { ComponentFactory } from '@teambit/component';
import gql from 'graphql-tag';

import { ReactMain } from './react.main.runtime';

export function reactSchema(react: ReactMain) {
  return {
    typeDefs: gql`
      extend type ComponentHost {
        getDocs(id: String!): ReactDocs
      }

      type ReactDocs {
        abstract: String
        filePath: String
        properties: [Property]
      }

      type Property {
        name: String
        description: String
        required: Boolean
        type: String
        defaultValue: DefaultValue
      }

      type DefaultValue {
        value: String
        computed: Boolean
      }
    `,
    resolvers: {
      ComponentHost: {
        getDocs: async (host: ComponentFactory, { id }: { id: string }) => {
          const componentId = await host.resolveComponentId(id);
          const component = await host.get(componentId);
          const empty = {
            abstract: '',
            filePath: '',
            properties: [],
          };

          if (!component) return empty;
          const docs = react.getDocs(component);
          if (!docs) return empty;

          return docs;
        },
      },
    },
  };
}
