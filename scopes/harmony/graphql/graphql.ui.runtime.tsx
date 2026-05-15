import type { ReactNode } from 'react';
import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import { InMemoryCache, ApolloClient, ApolloLink, HttpLink } from '@apollo/client';
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
  /**
   * batching is always wired up. operations are *opt-in*: each Apollo operation that sets
   * `context: { batch: true }` is coalesced via BatchHttpLink, every other operation goes through
   * a plain HttpLink unchanged. tune the batching window/cap via the fields below.
   */
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
    const httpLink = new HttpLink({
      uri: serverUrl,
      credentials: 'include',
      headers,
      fetch: crossFetch,
    });
    const batchHttpLink = new BatchHttpLink({
      uri: serverUrl,
      credentials: 'include',
      batchInterval: this.config.batchInterval,
      batchMax: this.config.batchMax,
      headers,
      fetch: crossFetch,
    });
    const transport = ApolloLink.split(this.shouldBatch, batchHttpLink, httpLink);

    return new ApolloClient({
      ssrMode: true,
      link: ApolloLink.from([onError(logError), transport]),
      cache: this.createCache(),
    });
  }

  private createCache({ state }: { state?: NormalizedCacheObject } = {}) {
    const cache = new InMemoryCache({
      typePolicies: {
        // The Aspect type has an `id` field (the aspect ID, e.g. "teambit.envs/envs").
        // Without this, Apollo normalizes all Aspect objects by __typename:id, causing
        // every component to share a single cache entry per aspect ID. This means the
        // last-written aspect data overwrites all others (e.g. all components show the
        // same env). Disabling normalization stores aspects inline per component.
        Aspect: { keyFields: false },
        Query: {
          fields: {
            // The schema federates `ComponentHost` extensions across aspects (component-compare's
            // `apiDiff`, scope's `get`/`getMany`, etc.). Different queries select different field
            // subsets of the same ComponentHost — without a merge policy Apollo replaces the
            // whole entry and warns about data loss. Field-level merge keeps each query's data
            // additive on the shared ComponentHost cache entry.
            getHost: {
              keyArgs: ['id'],
              merge: (existing, incoming) => ({ ...existing, ...incoming }),
            },
          },
        },
      },
    });

    if (state) cache.restore(state);

    return cache;
  }

  // operations opt in to batching by setting `context: { batch: true }`. mutations never batch.
  private readonly shouldBatch = (op: Operation) => {
    const def = getMainDefinition(op.query) as OperationDefinitionNode;
    if (def.kind === 'OperationDefinition' && def.operation === 'mutation') return false;
    return op.getContext().batch === true;
  };

  private createLink(uri: string, { subscriptionUri }: { subscriptionUri?: string } = {}) {
    const httpLink = new HttpLink({ credentials: 'include', uri });
    const batchHttpLink = new BatchHttpLink({
      uri,
      credentials: 'include',
      batchInterval: this.config.batchInterval,
      batchMax: this.config.batchMax,
    });
    const httpOrBatchLink = ApolloLink.split(this.shouldBatch, batchHttpLink, httpLink);

    const subsLink = subscriptionUri
      ? new WebSocketLink({ uri: subscriptionUri, options: { reconnect: true } })
      : undefined;
    const hybridLink = subsLink ? createSplitLink(httpOrBatchLink, subsLink) : httpOrBatchLink;

    return ApolloLink.from([onError(logError), hybridLink]);
  }

  getProvider = ({ client, children }: { client: GraphQLClient<any>; children: ReactNode }) => {
    return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
  };

  readonly renderPlugins = new GraphqlRenderPlugins(this);

  static runtime = UIRuntime;
  static dependencies = [];
  static slots = [];

  static defaultConfig: GraphQLConfig = {
    batchInterval: 50,
    batchMax: 20,
  };

  static async provider(_, config: GraphQLConfig) {
    return new GraphqlUI(config);
  }
}

GraphqlAspect.addRuntime(GraphqlUI);
