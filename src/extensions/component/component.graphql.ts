import Component from './component';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';

export function componentSchema() {
  return {
    typeDefs: `
      type Component {
        id: String
        version: String
        displayName: String
        versions(limit: Int): [String]
        isNew: Boolean
        isModified: Boolean
        packageName: String
      }

      type ComponentMeta {
        id: String
        displayName: String
      }
  `,
    resolvers: {
      ComponentMeta: {
        id: (component: Component) => component.id.toString(),
        displayName: (component: Component) => component.displayName
      },
      Component: {
        id: (component: Component) => component.id.toString(),
        displayName: (component: Component) => component.displayName,
        version: (component: Component) => component.state.version,
        isNew: (component: Component) => component.isNew(),
        isModified: (component: Component) => component.isModified(),
        /**
         * :TODO use legacy until @david will move it to the pkg extension.
         */
        packageName: (component: Component) => {
          return componentIdToPackageName(
            component.id._legacy,
            component.state._consumer.bindingPrefix,
            component.state._consumer.defaultScope
          );
        }
      }
    }
  };
}
