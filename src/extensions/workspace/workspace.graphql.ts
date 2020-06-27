import Workspace from './workspace';

export default (workspace: Workspace) => {
  return {
    typeDefs: `
      type Workspace {
        path: String
        components: [ComponentMeta]
        getComponent(id: String!): Component
      }

      type Query {
        workspace: Workspace
      }
    `,
    resolvers: {
      Workspace: {
        path: ws => ws.path,
        components: async (ws: Workspace) => {
          return ws.list();
        },
        getComponent: async (ws: Workspace, { id }: { id: string }) => {
          return ws.get(id);
        }
      },
      Query: {
        workspace: () => workspace
      }
    }
  };
};
