import gql from 'graphql-tag';
import { GraphQLJSONObject } from 'graphql-type-json';

import { Component } from './component';
import { ComponentFactory } from './component-factory';
import { ComponentMain } from './component.main.runtime';

export function componentSchema(componentExtension: ComponentMain) {
  return {
    typeDefs: gql`
      scalar JSON
      scalar JSONObject

      type ComponentID {
        name: String!
        version: String
        scope: String
      }

      type Tag {
        # semver assigned to the tag.
        version: String!

        # tag hash.
        hash: String!
      }

      type Snap {
        # hash of the snapshot.
        hash: String!

        # time of the snapshot.
        timestamp: String!

        # parents of the snap
        parents: [Snap]!

        # snapper
        author: Author!

        # snapshot message
        message: String
      }

      type LogEntry {
        message: String!
        username: String
        email: String
        date: String
        hash: String!
        tag: String
        # id: String!
      }

      type Author {
        # display name of the snapper.
        displayName: String!

        # author of the snapper.
        email: String!
      }

      type Component {
        # id of the component.
        id: ComponentID!

        # head snap of the component.
        head: Snap

        # head tag of the component.
        headTag: Tag

        # list of all relative component paths.
        fs: [String]

        # relative path to the main file of the component
        mainFile: String

        # return specific file contents by relative file path.
        getFile(path: String): String

        # latest version of the component.
        latest: String

        # display name of the component
        displayName: String!

        # list of component releases.
        tags: [Tag]!

        aspects: [Aspect]
      }

      type Aspect {
        id: String!
        icon: String
        config: JSONObject
        data: JSONObject
      }

      type ComponentHost {
        id: ID!
        name: String!

        # load a component.
        get(id: String!, withState: Boolean): Component

        # list components
        list(offset: Int, limit: Int): [Component]!

        # get component logs(snaps) by component id
        snaps(id: String!): [LogEntry]!
      }

      type Query {
        getHost(id: String): ComponentHost
      }
    `,
    resolvers: {
      JSONObject: GraphQLJSONObject,
      Component: {
        id: (component: Component) => component.id.toObject(),
        displayName: (component: Component) => component.displayName,
        fs: (component: Component) => {
          return component.state.filesystem.files.map((file) => file.relative);
        },
        getFile: (component: Component, { path }: { path: string }) => {
          const maybeFile = component.state.filesystem.files.find((file) => file.relative === path);
          if (!maybeFile) return undefined;
          return maybeFile.contents.toString('utf-8');
        },
        mainFile: (component: Component) => {
          return component.state._consumer.mainFile;
        },
        headTag: (component: Component) => component.headTag?.toObject(),
        latest: (component: Component) => component.latest,
        tags: (component) => {
          // graphql doesn't support map types
          return component.tags.toArray().map((tag) => tag.toObject());
        },
        aspects: (component: Component) => {
          const aspects = component.state.aspects.serialize();
          return aspects;
        },
      },
      ComponentHost: {
        get: async (host: ComponentFactory, { id }: { id: string }) => {
          try {
            const componentId = await host.resolveComponentId(id);
            const component = await host.get(componentId);
            return component;
          } catch (error) {
            return null;
          }
        },
        snaps: async (host: ComponentFactory, { id }: { id: string }) => {
          const componentId = await host.resolveComponentId(id);
          // return (await host.getLogs(componentId)).map(log => ({...log, id: log.hash}))
          return host.getLogs(componentId);
        },
        list: async (host: ComponentFactory, filter?: { offset: number; limit: number }) => {
          return host.list(filter);
        },
        id: async (host: ComponentFactory) => {
          return host.name;
        },
        name: async (host: ComponentFactory) => {
          return host.name;
        },
      },
      Query: {
        getHost: (componentExt: ComponentMain, { id }: { id: string }) => {
          return componentExtension.getHost(id);
        },
      },
    },
  };
}
