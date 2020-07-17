import gql from 'graphql-tag';
import { Component } from './component';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';

export function componentSchema() {
  return {
    typeDefs: gql`
      type ComponentID {
        name: String
        version: String
        scope: String
      }

      type Tag {
        version: String
        snap: Snap
      }

      type Snap {
        # hash of the snapshot.
        hash: String!

        # time of the snapshot.
        timestamp: String

        # parents of the snap
        parents: [Snap]

        # snapper
        author: Author

        # snapshot message
        message: String
      }

      type Author {
        # display name of the snapper.
        displayName: String

        # author of the snapper.
        email: String
      }

      type Tag {
        # semver assigned to the tag.
        version: String

        # tag snapshot.
        snap: Snap
      }

      type Component {
        # id of the component.
        id: ComponentID

        # head snap of the component.
        head: Snap

        # head tag of the component.
        headTag: Tag

        # display name of the component
        displayName: String

        # determines whether the component is new.
        isNew: Boolean

        # determines whether the component is modified since its last version.
        isModified: Boolean

        # package name of the component.
        packageName: String

        # list of component releases.
        tags: [Tag]
      }

      type ComponentMeta {
        id: ComponentID
        displayName: String
      }
    `,
    resolvers: {
      ComponentMeta: {
        id: (component: Component) => component.id._legacy.serialize(),
        displayName: (component: Component) => component.displayName,
      },
      Component: {
        id: (component: Component) => component.id._legacy.serialize(),
        displayName: (component: Component) => component.displayName,
        headTag: (component: Component) => component.headTag,
        tags: (component) => {
          // graphql doesn't support map types
          return component.tags.toArray().map((tag) => tag.toObject());
        },
        isNew: (component: Component) => component.isNew(),
        isModified: (component: Component) => component.isModified(),
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
    },
  };
}
