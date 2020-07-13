import Component from './component';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';

export function componentSchema() {
  return {
    typeDefs: `
      type ComponentID {
        name: String
        version: String
        scope: String
      }

      type Component {
        id: ComponentID
        version: String
        displayName: String
        versions(limit: Int): [String]
        isNew: Boolean
        isModified: Boolean
        packageName: String
      }

      type ComponentMeta {
        id: ComponentID
        displayName: String
      }
  `,
    resolvers: {
      ComponentMeta: {
        id: (component: Component) => component.id._legacy.serialize(),
        displayName: (component: Component) => component.displayName
      },
      Component: {
        id: (component: Component) => component.id._legacy.serialize(),
        displayName: (component: Component) => component.displayName,
        version: (component: Component) => component.state.version,
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
            isDependency: false
          });
        }
      }
    }
  };
}
