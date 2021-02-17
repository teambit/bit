import { Component } from '@teambit/component';
import { Schema } from '@teambit/graphql';
import { gql } from '@apollo/client';

import { BundlerMain } from './bundler.main.runtime';

// TODO: this has to be refactored to the Preview aspect. with the entire preview logic here.
export function devServerSchema(bundler: BundlerMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        server: ComponentServer
      }

      type ComponentServer {
        env: String
        url: String
      }
    `,
    resolvers: {
      Component: {
        server: (component: Component) => {
          const componentServer = bundler.getComponentServer(component);
          if (!componentServer) return {};

          return {
            env: componentServer.context.envRuntime.id,
            url: componentServer.url,
          };
        },
      },
    },
  };
}
