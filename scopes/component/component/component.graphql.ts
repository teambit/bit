import stripAnsi from 'strip-ansi';
import { gql } from 'graphql-tag';
import { GraphQLJSONObject } from 'graphql-type-json';
import type { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import type { ComponentLog } from '@teambit/objects';
import type { Schema } from '@teambit/graphql';
import type { Component } from './component';
import type { ComponentFactory } from './component-factory';
import type { ComponentMain } from './component.main.runtime';

/**
 * Per-Component-instance caches for resolver field outputs. Each batched lane-compare request fans
 * out to ~10–20 `Component` ops that all eventually call `host.get()` for the same versioned id —
 * which returns the same `Component` instance (via `ScopeComponentLoader.componentsCache`). Without
 * these WeakMaps, every op re-runs the same `aspects.filter(include).serialize()`,
 * `tags.toArray().map(toObject)`, `headTag.toObject()` etc.
 *
 * WeakMaps so entries disappear when the underlying `Component` is evicted from scope cache.
 */
const aspectsResolverCache = new WeakMap<Component, Map<string, any>>();
const tagsResolverCache = new WeakMap<Component, any>();
const headTagResolverCache = new WeakMap<Component, any>();
const fsResolverCache = new WeakMap<Component, string[]>();

export function componentSchema(componentExtension: ComponentMain): Schema {
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
        displayName: String
        username: String
        parents: [String]!
        email: String
        date: String
        hash: String!
        tag: String
        id: String!
        profileImage: String

        # whether this specific version is deprecated (full component deprecation or matched by a deprecation range)
        deprecated: Boolean
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

        """
        element url of the component - this is deprecated, and will return empty string now.
        it's here to not break old queries
        """
        elementsUrl: String @deprecated(reason: "Not in use anymore")
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

        # load multiple components in a single op. items are aligned to the input order;
        # an id that fails to resolve becomes null in its slot rather than failing the call.
        getMany(ids: [String!]!, withState: Boolean): [Component]!

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
        id: (component: Component): ComponentIdObj => component.id.toObject(),
        displayName: (component: Component) => component.displayName,
        fs: (component: Component) => {
          const cached = fsResolverCache.get(component);
          if (cached) return cached;
          const result = component.state.filesystem.files.map((file) => file.relative);
          fsResolverCache.set(component, result);
          return result;
        },
        log: async (component: Component) => {
          const snap = await component.loadSnap(component.id.version);
          return {
            ...snap,
            date: snap.timestamp.getTime(),
            email: snap.author.email,
            username: snap.author.name,
            displayName: snap.author.displayName,
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
        headTag: (component: Component) => {
          if (headTagResolverCache.has(component)) return headTagResolverCache.get(component);
          const result = component.headTag?.toObject();
          headTagResolverCache.set(component, result);
          return result;
        },
        latest: (component: Component) => component.latest,
        tags: (component) => {
          const cached = tagsResolverCache.get(component);
          if (cached) return cached;
          // graphql doesn't support map types
          const result = component.tags.toArray().map((tag) => tag.toObject());
          tagsResolverCache.set(component, result);
          return result;
        },
        aspects: (component: Component, { include }: { include?: string[] }) => {
          let perComponent = aspectsResolverCache.get(component);
          if (!perComponent) {
            perComponent = new Map();
            aspectsResolverCache.set(component, perComponent);
          }
          // sort the include list so callers that pass the same set in different order still hit cache.
          const cacheKey = include ? [...include].sort().join('|') : '__all__';
          const cached = perComponent.get(cacheKey);
          if (cached) return cached;
          const result = component.state.aspects.filter(include).serialize();
          perComponent.set(cacheKey, result);
          return result;
        },
        // Here only to not break old queries
        elementsUrl: () => undefined,
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
          const finalFilter = { ...filter, head };
          return (await component.getLogs(finalFilter)).map((log) => ({ ...log, id: log.hash }));
        },
      },
      ComponentHost: {
        get: async (host: ComponentFactory, { id }: { id: string }) => {
          try {
            const componentId = await host.resolveComponentId(id);
            const component = await host.get(componentId);
            return component;
          } catch {
            return null;
          }
        },
        getMany: async (host: ComponentFactory, { ids }: { ids: string[] }) => {
          // run resolves+loads in parallel — `host.getMany` uses `mapSeries` under the hood, which
          // serializes the work and defeats the whole point of bulk. each entry is independent and
          // the underlying ScopeComponentLoader has its own per-id cache, so concurrency is safe.
          return Promise.all(
            ids.map(async (id) => {
              try {
                const componentId = await host.resolveComponentId(id);
                return await host.get(componentId);
              } catch {
                return null;
              }
            })
          );
        },
        snaps: async (host: ComponentFactory, { id }: { id: string }): Promise<ComponentLog[]> => {
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
            id: id as ComponentID,
            errorName: err.name,
            errorMessage: err.message ? stripAnsi(err.message) : err.name,
          }));
        },
        id: async (host: ComponentFactory, _args, _context, info) => {
          // suffix the id with the requested host id so data fetched from different hosts (e.g. the
          // workspace vs the scope during local-vs-scope compare, #9549) normalizes into distinct
          // Apollo cache entities. A child field resolver can't see its parent's args, so the
          // requested host is read from the operation's variables — and queries pass it under TWO
          // names: `$extensionId` (file/artifact/lane-component queries) and `$host` (bulk
          // compare/api-diff queries). Honoring both keeps the entity id consistent across the
          // conventions. When this depended on `$extensionId` alone, the same host normalized into
          // two different entities depending on which query fetched it; every response re-pointed
          // the `getHost` root ref at its own flavor, orphaning the other's cached fields — which
          // forced cache-first consumers (the bulk compare pager) into endless refetch loops.
          const hostId = info.variableValues.extensionId ?? info.variableValues.host;
          return hostId ? `${host.name}/${hostId}` : host.name;
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
