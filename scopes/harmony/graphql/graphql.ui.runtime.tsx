import React, { ReactNode } from 'react';
import { createClient } from 'graphql-ws';
import { print } from 'graphql';
import { Observable } from '@apollo/client/utilities';
import { FetchResult } from '@apollo/client/core';
import { UIRuntime } from '@teambit/ui';
import { InMemoryCache, ApolloClient, createHttpLink, ApolloLink } from '@apollo/client';
import type { NormalizedCacheObject } from '@apollo/client';
import { onError } from '@apollo/client/link/error';

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
};

export class GraphqlUI {
  createClient(uri: string, { state, subscriptionUri }: ClientOptions = {}) {
    const client = new ApolloClient({
      link: this.createLink(uri, { subscriptionUri }),
      cache: this.createCache({ state }),
    });

    return client;
  }

  createSsrClient({ serverUrl, headers }: { serverUrl: string; headers: any }) {
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

  private createCache({ state }: { state?: NormalizedCacheObject } = {}) {
    const cache = new InMemoryCache();
    if (state) cache.restore(state);
    return cache;
  }

  private createLink(uri: string, { subscriptionUri }: { subscriptionUri?: string } = {}) {
    const httpLink = createHttpLink({
      credentials: 'include',
      uri,
      fetch: crossFetch,
    });
    const wsClient = subscriptionUri ? createClient({ url: subscriptionUri }) : undefined;

    const subsLink = subscriptionUri
      ? new ApolloLink((operation) => {
          const observable = new Observable<FetchResult>((observer) => {
            const { variables } = operation;
            const query = print(operation.query);

            const dispose = wsClient?.subscribe(
              { query, variables },
              {
                next: ({ data }) => observer.next({ data }),
                error: (error) => observer.error(error),
                complete: () => observer.complete(),
              }
            );

            return () => {
              dispose?.();
            };
          });

          return observable;
        })
      : undefined;

    const hybridLink = subsLink ? createSplitLink(httpLink, subsLink) : httpLink;
    const errorLogger = onError(logError);

    return ApolloLink.from([errorLogger, hybridLink]);
  }

  /**
   * get the graphQL provider
   */
  getProvider = ({ client, children }: { client: GraphQLClient<any>; children: ReactNode }) => {
    return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
  };

  readonly renderPlugins = new GraphqlRenderPlugins(this);

  static runtime = UIRuntime;
  static dependencies = [];
  static slots = [];

  static async provider() {
    const graphqlUI = new GraphqlUI();

    return graphqlUI;
  }
}

GraphqlAspect.addRuntime(GraphqlUI);
