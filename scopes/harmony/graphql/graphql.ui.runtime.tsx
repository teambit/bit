import type { ReactNode } from 'react';
import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import { InMemoryCache, ApolloClient, ApolloLink, HttpLink, createHttpLink } from '@apollo/client';
import type { DefaultOptions, NormalizedCacheObject, Operation } from '@apollo/client';
import { WebSocketLink } from '@apollo/client/link/ws';
import { onError } from '@apollo/client/link/error';
import { getMainDefinition } from '@apollo/client/utilities';
import type { OperationDefinitionNode } from 'graphql';

import crossFetch from 'cross-fetch';

import { createSplitLink } from './create-link';
import { GraphQLProvider } from './graphql-provider';
import { GraphqlAspect } from './graphql.aspect';
import { GraphqlRenderPlugins } from './render-lifecycle';
import { logError } from './logging';

/**
 * Type of gql client.
 * Used to abstract Apollo client, so consumers could import the type from graphql.ui, and not have to depend on @apollo/client directly
 * */
export type GraphQLClient<T> = ApolloClient<T>;

type ClientOptions = {
  /** Preset in-memory cache with state (e.g. continue state from SSR) */
  state?: NormalizedCacheObject;
  /** endpoint for websocket connections */
  subscriptionUri?: string;
  /** host extension id (workspace or scope). Used to configure the client */
  host?: string;
};

export type GraphQLConfig = {
  enableBatching?: boolean;
  batchInterval?: number;
  batchMax?: number;
};

export class GraphqlUI {
  constructor(readonly config: GraphQLConfig = {}) {}

  createClient(uri: string, { state, subscriptionUri, host }: ClientOptions = {}) {
    const defaultOptions: DefaultOptions | undefined =
      host === 'teambit.workspace/workspace'
        ? {
            query: {
              fetchPolicy: 'network-only',
            },
            watchQuery: {
              fetchPolicy: 'network-only',
            },
            mutate: {
              fetchPolicy: 'network-only',
            },
          }
        : undefined;
    const client = new ApolloClient({
      link: this.createLink(uri, { subscriptionUri }),
      cache: this.createCache({ state }),
      defaultOptions,
    });

    return client;
  }

  createSsrClient({ serverUrl, headers }: { serverUrl: string; headers: any }) {
    if (this.config.enableBatching) {
      return this.createSsrClientBatched({ serverUrl, headers });
    }
    const link = ApolloLink.from([
      onError(logError),
      createHttpLink({
        credentials: 'include',
        uri: serverUrl,
        headers,
        fetch: crossFetch,
      }),
    ]);

    const client = new ApolloClient({
      ssrMode: true,
      link,
      cache: this.createCache(),
    });

    return client;
  }

  private createSsrClientBatched({ serverUrl, headers }: { serverUrl: string; headers: any }) {
    const batchedHttpLink = new BatchHttpLink({
      uri: serverUrl,
      credentials: 'include',
      batchInterval: this.config.batchInterval,
      batchMax: this.config.batchMax,
      headers,
      fetch: crossFetch,
    });

    const httpLink = ApolloLink.split(
      this.isMutation,
      new HttpLink({
        uri: serverUrl,
        credentials: 'include',
        headers,
        fetch: crossFetch,
      }),
      batchedHttpLink
    );

    return new ApolloClient({
      ssrMode: true,
      link: ApolloLink.from([onError(logError), httpLink]),
      cache: this.createCache(),
    });
  }

  private createCache({ state }: { state?: NormalizedCacheObject } = {}) {
    const cache = new InMemoryCache();

    if (state) cache.restore(state);

    return cache;
  }

  private readonly isMutation = (op: Operation) => {
    const def = getMainDefinition(op.query) as OperationDefinitionNode;
    return def.kind === 'OperationDefinition' && def.operation === 'mutation';
  };

  private createLink(uri: string, { subscriptionUri }: { subscriptionUri?: string } = {}) {
    if (this.config.enableBatching) {
      return this.createLinkBatched(uri, { subscriptionUri });
    }
    const httpLink = new HttpLink({ credentials: 'include', uri });
    const subsLink = subscriptionUri
      ? new WebSocketLink({
          uri: subscriptionUri,
          options: { reconnect: true },
        })
      : undefined;

    const hybridLink = subsLink ? createSplitLink(httpLink, subsLink) : httpLink;
    const errorLogger = onError(logError);

    return ApolloLink.from([errorLogger, hybridLink]);
  }

  private createLinkBatched(uri: string, { subscriptionUri }: { subscriptionUri?: string } = {}) {
    const batchedHttpLink = new BatchHttpLink({
      uri,
      credentials: 'include',
      batchInterval: this.config.batchInterval,
      batchMax: this.config.batchMax,
    });

    const unbatchedHttpLink = new HttpLink({
      uri,
      credentials: 'include',
    });

    const httpLink = ApolloLink.split(this.isMutation, unbatchedHttpLink, batchedHttpLink);

    const wsLink = subscriptionUri
      ? new WebSocketLink({ uri: subscriptionUri, options: { reconnect: true } })
      : undefined;

    const transport = wsLink ? createSplitLink(httpLink, wsLink) : httpLink;

    return ApolloLink.from([onError(logError), transport]);
  }

  getProvider = ({ client, children }: { client: GraphQLClient<any>; children: ReactNode }) => {
    return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
  };

  readonly renderPlugins = new GraphqlRenderPlugins(this);

  static runtime = UIRuntime;
  static dependencies = [];
  static slots = [];

  static defaultConfig: GraphQLConfig = {
    enableBatching: false,
    batchInterval: 50,
    batchMax: 20,
  };

  static async provider(_, config: GraphQLConfig) {
    return new GraphqlUI(config);
  }
}

GraphqlAspect.addRuntime(GraphqlUI);
