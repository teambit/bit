import gql from 'graphql-tag';
import Workspace from './workspace';

export default (workspace: Workspace) => {
  return {
    typeDefs: gql`
      type Workspace {
        name: String
        path: String
        components: [Component]
        getComponent(id: String!): Component
      }

      type Query {
        workspace: Workspace
      }
    `,
    resolvers: {
      Workspace: {
        path: (ws) => ws.path,
        name: (ws) => ws.name,
        components: async (ws: Workspace) => {
          return ws.list();
        },
        getComponent: async (ws: Workspace, { id }: { id: string }) => {
          const componentID = await ws.resolveComponentId(id);
          return ws.get(componentID);
        },
      },
      Query: {
        workspace: () => workspace,
      },
    },
  };
};
