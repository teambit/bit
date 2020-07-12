import Workspace from './workspace';

export default (workspace: Workspace) => {
  return {
    typeDefs: `
      type Workspace {
        name: String
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
        name: ws => ws.name,
        components: async (ws: Workspace) => {
          return ws.list();
        },
        getComponent: async (ws: Workspace, { id }: { id: string }) => {
          console.log(id);
          return ws.get(id);
        }
      },
      Query: {
        workspace: () => workspace
      }
    }
  };
};
