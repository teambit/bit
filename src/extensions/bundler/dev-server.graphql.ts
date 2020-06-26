import { Schema } from '../graphql';
import { BundlerExtension } from './bundler.extension';
import { Component } from '../component';

export function devServerSchema(bundler: BundlerExtension): Schema {
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
        devServer: (component: Component) => {
          const componentServer = bundler.getComponentServer(component);
          if (!componentServer) return {};

          return {
            env: componentServer.env.id,
            url: componentServer.url
          };
        }
      }
    }
  };
}
