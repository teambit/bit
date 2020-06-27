import Component from './component';

export function componentSchema() {
  return {
    typeDefs: `
      type Component {
        id: String
        displayName: String
        versions(limit: Int): [String]
        isNew: Boolean
        isModified: Boolean
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
        isNew: (component: Component) => component.isNew(),
        isModified: (component: Component) => component.isModified(),
        versions: (component: Component, { limit = 10 }: { limit?: number }) =>
          [...component.tags.keys()].slice(0, limit).map(x => x.toString())
      }
    }
  };
}
