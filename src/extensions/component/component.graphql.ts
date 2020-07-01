import Component from './component';

export function componentSchema() {
  return {
    typeDefs: `
      type Component {
        id: String
        displayName: String
        # TEMP, to
        versions(limit: Int): [Snap]
        snaps(limit: Int): [Snap]
        isNew: Boolean
        isModified: Boolean
      }

      type ComponentMeta {
        id: String
        displayName: String
      }
      
      type Snap {
        message: String
        owner: Account
        timestamp: String
        """test status (pass/fail/pending/skipped)"""
        test: String
        #"""ci status"""
        # ci: String
      }
      
      type Account {
        name: String
        # type: String
        """gravatar link or equivalent"""
        image: String
        """Could be empty due to security"""
        email: String
        #"""The display name chosen by user in his settings page. Could be family name or nickname."""
        # displayName: String # required, TBD
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
        snaps: (component: Component, { limit = 10 }: { limit?: number }) => [...component.tags.keys()].slice(0, limit), //TODO
        // TEMP, to remove
        versions: (component: Component, { limit = 10 }: { limit?: number }) =>
          [...component.tags.keys()].slice(0, limit).map(x => x.toString())
      }
    }
  };
}
