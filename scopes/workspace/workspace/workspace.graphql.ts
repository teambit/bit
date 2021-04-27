import { GraphqlMain } from '@teambit/graphql';
import gql from 'graphql-tag';

import { ComponentAdded, ComponentChanged, Workspace } from './workspace';
import { WorkspaceComponent } from './workspace-component';

export default (workspace: Workspace, graphql: GraphqlMain) => {
  return {
    typeDefs: gql`
      type ModifyInfo {
        # is the component modified.
        hasModifiedFiles: Boolean

        # the component has Modified Dependencies
        hasModifiedDependencies: Boolean
      }

      type ComponentStatus {
        # component is pending to be tagged automatically.
        modifyInfo: ModifyInfo

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

        # does the component is outdated (pending for update).
        isOutdated: Boolean
      }

      extend type Component {
        status: ComponentStatus
      }

      extend type Component {
        # the count of errors in component in workspace
        issuesCount: Int
      }

      type Workspace {
        name: String
        path: String
        icon: String
        components(offset: Int, limit: Int): [Component]
        getComponent(id: String!): Component
      }

      type Subscription {
        componentAdded: ComponentAdded
        componentChanged: ComponentChanged
      }

      type ComponentAdded {
        component: Component
      }

      type ComponentChanged {
        component: Component
      }

      type Query {
        workspace: Workspace
      }
    `,
    resolvers: {
      Subscription: {
        componentAdded: {
          subscribe: () => graphql.pubsub.asyncIterator(ComponentAdded),
        },
        componentChanged: {
          subscribe: () => graphql.pubsub.asyncIterator(ComponentChanged),
        },
      },
      Component: {
        status: async (wsComponent: WorkspaceComponent) => {
          return wsComponent.getStatus();
        },
        issuesCount: async (wsComponent: WorkspaceComponent): Promise<number> => {
          return (await wsComponent.getIssues())?.count || 0;
        },
      },
      Workspace: {
        path: (ws) => ws.path,
        name: (ws) => ws.name,
        icon: (ws) => ws.icon,
        components: async (ws: Workspace, { offset, limit }: { offset: number; limit: number }) => {
          return ws.list({ offset, limit });
        },
        getComponent: async (ws: Workspace, { id }: { id: string }) => {
          try {
            const componentID = await ws.resolveComponentId(id);
            const component = await ws.get(componentID);
            return component;
          } catch (error) {
            return null;
          }
        },
      },
      Query: {
        workspace: () => workspace,
      },
    },
  };
};
