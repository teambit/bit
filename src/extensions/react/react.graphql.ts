import { ReactExtension } from './react.extension';
import { ComponentFactory } from '../component';

export function reactSchema(react: ReactExtension) {
  return {
    typeDefs: `
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
