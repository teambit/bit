import stripAnsi from 'strip-ansi';
import gql from 'graphql-tag';
import { GraphQLJSONObject } from 'graphql-type-json';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
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
        parents: [String]!

        # snapper
        author: Author!

        # snapshot message
        message: String
      }

      type LogEntry {
        message: String!
        username: String
        parents: [String]!
        email: String
        date: String
        hash: String!
        tag: String
        id: String!
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

        # component buildStatus
        buildStatus: String

        # list of component releases.
        tags: [Tag]!

        # Log entry of the component.
        log: LogEntry!

        """
        component logs
        """
        logs(
          """
          type of logs to show (tag or snap)
          """
          type: String
          offset: Int
          limit: Int
          """
          head to start traversing logs from
          """
          head: String
          sort: String
          """
          start traversing logs from the fetched component's head
          """
          takeHeadFromComponent: Boolean
        ): [LogEntry]!

        aspects(include: [String]): [Aspect]
      }

      type Aspect {
        id: String!
        icon: String
        config: JSONObject
        data: JSONObject
      }

      type InvalidComponent {
        id: ComponentID!
        errorName: String!
        errorMessage: String!
      }

      type ComponentHost {
        id: ID!
        name: String!

        # load a component.
        get(id: String!, withState: Boolean): Component

        # list components
        list(offset: Int, limit: Int): [Component]!

        # list invalid components and their errors
        listInvalid: [InvalidComponent]!

        # get component logs(snaps) by component id
        snaps(id: String!): [LogEntry]! @deprecated(reason: "Use the logs field on Component")
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
        log: async (component: Component) => {
          const snap = await component.loadSnap(component.id.version);
          return {
            ...snap,
            date: snap.timestamp.getTime(),
            email: snap.author.email,
            username: snap.author.displayName,
            id: snap.hash,
          };
        },
        getFile: (component: Component, { path }: { path: string }) => {
          const maybeFile = component.state.filesystem.files.find(
            (file) => pathNormalizeToLinux(file.relative) === path
          );
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
        aspects: (component: Component, { include }: { include?: string[] }) => {
          return component.state.aspects.filter(include).serialize();
        },
        logs: async (
          component: Component,
          filter?: {
            type?: string;
            offset?: number;
            limit?: number;
            head?: string;
            sort?: string;
            takeHeadFromComponent: boolean;
          }
        ) => {
          let head = filter?.head;
          if (!head && filter?.takeHeadFromComponent) {
            head = component.id.version;
          }
          const finalFilter = { ...filter, ...{ head } };
          return (await component.getLogs(finalFilter)).map((log) => ({ ...log, id: log.hash }));
        },
      },
      ComponentHost: {
        get: async (host: ComponentFactory, { id }: { id: string }) => {
          try {
            const componentId = await host.resolveComponentId(id);
            const component = await host.get(componentId);
            return component;
          } catch (error: any) {
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
        listInvalid: async (host: ComponentFactory) => {
          const invalidComps = await host.listInvalid();
          return invalidComps.map(({ id, err }) => ({
            id,
            errorName: err.name,
            errorMessage: err.message ? stripAnsi(err.message) : err.name,
          }));
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
