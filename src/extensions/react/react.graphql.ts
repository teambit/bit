import { Workspace } from '../workspace';
import { ReactExtension } from './react.extension';

export function reactSchema(react: ReactExtension) {
  return {
    typeDefs: `
      extend type Workspace {
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
      Workspace: {
        getDocs: async (ws: Workspace, { id }: { id: string }) => {
          const componentId = await ws.resolveComponentId(id);
          const component = await ws.get(componentId);
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
