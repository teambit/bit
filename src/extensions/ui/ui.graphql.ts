import { GraphQLModule } from '@graphql-modules/core';
import { UIExtension } from './ui.extension';

export function uiSchema(ui: UIExtension) {
  return {
    typeDefs: `
      extend type Component {
        devServer: DevServer
      }

      type DevServer {
        env: String
        url: String
      }
    `,
    resolvers: {
      Component: {
        devServer: () => 'ui'
      }
    }
  };
}
