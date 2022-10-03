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
        server: (component: Component, args, context) => {
          // This is a bit of a hack to get the requested id. it assumes the variable name of
          // the gotHost.get query is "id".
          // see it in scopes/component/component/component.graphql.ts
          // const requestedId = context.body.variables.id;
          // if we ask for specific id with specific version it means we want to fetch if from scope
          // so don't return the server url
          // see https://github.com/teambit/bit/issues/5328
          // if (requestedId && requestedId.includes('@')) {
          //   return {};
          // }
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
