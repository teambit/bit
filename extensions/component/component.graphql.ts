import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';
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

        # tag snapshot.
        snap: Snap!
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

        # latest version of the component.
        latest: String

        # display name of the component
        displayName: String!

        # package name of the component.
        packageName: String

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
        name: String!

        # load a component.
        get(id: String!, withState: Boolean): Component

        # list components
        list(offset: Int, limit: Int): [Component]!
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
        /**
         * :TODO use legacy until @david will move it to the pkg extension.
         */
        packageName: (component: Component) => {
          return componentIdToPackageName({
            id: component.id._legacy,
            bindingPrefix: component.state._consumer.bindingPrefix,
            defaultScope: component.state._consumer.defaultScope,
            withPrefix: true,
            extensions: component.config.extensions,
            isDependency: false,
          });
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
        list: async (host: ComponentFactory, filter?: { offset: number; limit: number }) => {
          return host.list(filter);
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
