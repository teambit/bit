import gql from 'graphql-tag';
import { Workspace } from './workspace';
import { WorkspaceComponent } from './workspace-component';

export default (workspace: Workspace) => {
  return {
    typeDefs: gql`
      type ComponentStatus {
        # is the component modified.
        isModified: Boolean

        # is the new component new.
        isNew: Boolean

        # is the component deleted from the workspace.
        isDeleted: Boolean

        # is the component staged.
        isStaged: Boolean

        # does the component exists in the workspace.
        isInWorkspace: Boolean

        # does the component exists in the scope.
        isInScope: Boolean
      }

      type ComponentIssues {
        issue: String
      }

      extend type Component {
        status: ComponentStatus
      }

      extend type Component {
        getIssues: [ComponentIssues]
      }

      type Workspace {
        name: String
        path: String
        components(offset: Int, limit: Int): [Component]
        getComponent(id: String!): Component
      }

      type Query {
        workspace: Workspace
      }
    `,
    resolvers: {
      Component: {
        status: async (wsComponent: WorkspaceComponent) => {
          return wsComponent.getStatus();
        },
        issues: async (wsComponent: WorkspaceComponent) => {
          return wsComponent.getIssues();
        },
      },
      Workspace: {
        path: (ws) => ws.path,
        name: (ws) => ws.name,
        components: async (ws: Workspace, { offset, limit }: { offset: number; limit: number }) => {
          return ws.list({ offset, limit });
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
