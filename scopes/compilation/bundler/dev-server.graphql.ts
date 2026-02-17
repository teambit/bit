import type { Component } from '@teambit/component';
import type { GraphqlMain, Schema } from '@teambit/graphql';
import { gql } from '@apollo/client';
import type { BundlerMain } from './bundler.main.runtime';
import { ComponentServerCompilationChangedEvent, ComponentServerStartedEvent } from './events';

export function devServerSchema(bundler: BundlerMain, graphql: GraphqlMain): Schema {
  return {
    typeDefs: gql`
      extend type Component {
        server: ComponentServer
      }

      type ComponentServer {
        id: ID!
        env: String
        url: String
        host: String
        basePath: String
        isCompiling: Boolean
      }

      type ComponentServerCompilationStatus {
        env: String!
        affectedEnvs: [String!]
        url: String
        host: String
        basePath: String
        isCompiling: Boolean!
        errorCount: Int!
        warningCount: Int!
      }

      type Subscription {
        componentServerStarted(id: String): [ComponentServer!]!
        componentServerCompilationChanged(id: String): ComponentServerCompilationStatus
      }
    `,
    resolvers: {
      Component: {
        server: (component: Component, args, context) => {
          // This is a bit of a hack to get the requested id. it assumes the variable name of
          // the gotHost.get query is "id".
          // see it in scopes/component/component/component.graphql.ts
          const requestedId = context?.body?.variables?.id;
          // if we ask for specific id with specific version it means we want to fetch if from scope
          // so don't return the server url
          // see https://github.com/teambit/bit/issues/5328
          if (requestedId && requestedId.includes('@')) {
            return {
              id: 'no-server',
            };
          }

          const componentServer = bundler.getComponentServer(component);
          if (!componentServer)
            return {
              id: 'no-server',
            };

          return {
            id: `server-${componentServer.context.envRuntime.id}`,
            env: componentServer.context.envRuntime.id,
            url: componentServer.url,
            host: componentServer.hostname,
            basePath: componentServer.context.rootPath,
            isCompiling: !!componentServer.isCompiling,
          };
        },
      },
      Subscription: {
        componentServerStarted: {
          subscribe: () => graphql.pubsub.asyncIterator([ComponentServerStartedEvent]),
          resolve: (payload, { id }) => {
            const server = payload.componentServers;

            if (!server || (id && server.context.envRuntime.id !== id)) {
              return [];
            }

            return [
              {
                id: `server-${server.context.envRuntime.id}`,
                env: server.context.envRuntime.id,
                url: server.url,
                host: server.hostname,
                basePath: server.context.rootPath,
                isCompiling: !!server.isCompiling,
              },
            ];
          },
        },
        componentServerCompilationChanged: {
          subscribe: () => graphql.pubsub.asyncIterator([ComponentServerCompilationChangedEvent]),
          resolve: (payload, { id }) => {
            const status = payload?.componentServerCompilation;
            if (!status?.env) return null;
            if (id && status.env !== id) return null;
            return {
              env: status.env,
              affectedEnvs: Array.isArray(status.affectedEnvs) ? status.affectedEnvs : [],
              url: status.url,
              host: status.host,
              basePath: status.basePath,
              isCompiling: !!status.isCompiling,
              errorCount: Number(status.errorCount || 0),
              warningCount: Number(status.warningCount || 0),
            };
          },
        },
      },
    },
  };
}
