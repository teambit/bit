import { GraphQLModule } from '@graphql-modules/core';
import Workspace from './workspace';
import { Component } from '../component';

export default (workspace: Workspace) => {
  return {
    typeDefs: `
      type Workspace {
        path: String
        components: [Component]
        getComponent(id: String!): Component
      }

      type Component {
        id: String
        versions(limit: Int): [String]
        isNew: Boolean
        isModified: Boolean
      }

      type Query {
        workspace: Workspace
      }
    `,
    resolvers: {
      Component: {
        id: (component: Component) => component.id.toString(),
        isNew: (component: Component) => component.isNew(),
        isModified: (component: Component) => component.isModified(),
        versions: (component: Component, { limit = 10 }: { limit?: number }) =>
          [...component.tags.keys()].slice(0, limit).map(x => x.toString())
      },
      Workspace: {
        path: ws => ws.path,
        components: async (ws: Workspace) => {
          return ws.list();
        },
        getComponent: async (ws: Workspace, { id }: { id: string }, context, info) => {
          return ws.get(id);
        }
      },
      Query: {
        workspace: () => workspace
      }
    }
  };
};
