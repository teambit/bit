import { GraphQLModule } from '@graphql-modules/core';
import Workspace from './workspace';

export default (workspace: Workspace) => {
  return new GraphQLModule({
    typeDefs: `
      type Workspace {
        path: String
        components: [Component]
      }

      type Component {
        id: String
      }

      type Query {
        workspace: Workspace
      } 
    `,
    resolvers: {
      Component: {
        id: component => component.id.toString()
      },
      Workspace: {
        path: ws => ws.path,
        components: async (ws: Workspace) => {
          return ws.list();
        }
      },
      Query: {
        workspace: () => workspace
      }
    }
  });
};
