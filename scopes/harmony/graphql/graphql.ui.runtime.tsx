import type { ReactNode } from 'react';
import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import { InMemoryCache, ApolloClient, ApolloLink, HttpLink, createHttpLink } from '@apollo/client';
import type { NormalizedCacheObject, Operation } from '@apollo/client';
import { WebSocketLink } from '@apollo/client/link/ws';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { asyncMap, getMainDefinition } from '@apollo/client/utilities';
import type { OperationDefinitionNode } from 'graphql';

import crossFetch from 'cross-fetch';

import { persistCache, LocalStorageWrapper } from 'apollo3-cache-persist';

import { createSplitLink } from './create-link';
import { GraphQLProvider } from './graphql-provider';
import { GraphqlAspect } from './graphql.aspect';
import { GraphqlRenderPlugins } from './render-lifecycle';
import { logError } from './logging';

const CONNECTION_STATUS_EVENT = 'bit-dev-server-connection-status';

function reportConnectionStatus(online: boolean, reason?: 'network' | 'preview') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(CONNECTION_STATUS_EVENT, {
      detail: { online, reason, timestamp: Date.now() },
    })
  );
}

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

  async createClient(uri: string, { state, subscriptionUri, host }: ClientOptions = {}) {
    const cache = this.createCache({ state });

    // Persist Apollo cache to localStorage for instant workspace reloads.
    // On refresh, data renders from cache immediately while network refreshes in background.
    if (typeof window !== 'undefined') {
      try {
        const workspaceKeyRaw =
          (window as Window & { __BIT_WORKSPACE_CACHE_KEY__?: string }).__BIT_WORKSPACE_CACHE_KEY__ ||
          host ||
          'default';
        const workspaceKey = String(workspaceKeyRaw)
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, '-')
          .slice(0, 80);
        const originKey = window.location.host.replace(/[^a-z0-9_-]+/gi, '_');
        const t0 = performance.now();
        await persistCache({
          cache,
          storage: new LocalStorageWrapper(window.localStorage),
          key: `apollo-cache-${originKey}-${workspaceKey}`,
          maxSize: 1048576 * 5, // 5MB
          debounce: 1000,
        });
        const cacheData = cache.extract();
        const cacheEntries = Object.keys(cacheData).length;
        // eslint-disable-next-line no-console
        console.log(`[apollo-cache] restored ${cacheEntries} entries in ${(performance.now() - t0).toFixed(0)}ms`);

        // Clear stale server URLs from cache to prevent cancelled iframe requests on restart.
        // Component metadata (names, compositions, etc.) renders instantly from cache;
        // server.url comes fresh from network via cache-and-network policy.
        if (cacheEntries > 0) {
          let cleared = 0;
          for (const key of Object.keys(cacheData)) {
            const entry = cacheData[key] as Record<string, any> | undefined;
            if (entry && entry.url && typeof entry.url === 'string' && entry.url.startsWith('/preview/')) {
              entry.url = null;
              cleared++;
            }
          }
          if (cleared > 0) {
            cache.restore(cacheData);
            // eslint-disable-next-line no-console
            console.log(`[apollo-cache] cleared ${cleared} stale server URLs`);
          }
        }
      } catch {
        // localStorage may be full or unavailable — continue without persistence
      }
    }

    const client = new ApolloClient({
      link: this.createLink(uri, { subscriptionUri }),
      cache,
    });
    reportConnectionStatus(true, 'network');

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

    const unbatchedHttpLink = new HttpLink({
      uri: serverUrl,
      credentials: 'include',
      headers,
      fetch: crossFetch,
    });

    const httpLink = ApolloLink.split(this.shouldSkipBatch, unbatchedHttpLink, batchedHttpLink);

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

  private readonly shouldSkipBatch = (op: Operation) => {
    if (this.isMutation(op)) return true;
    return op.getContext().skipBatch === true;
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
    const errorLogger = onError((error) => {
      logError(error);
      if (error.networkError) reportConnectionStatus(false, 'network');
    });

    // Retry transient network failures (dev server restarts, brief disconnections).
    // Only retries queries/subscriptions — mutations are not retried (not idempotent).
    const retryLink = new RetryLink({
      delay: { initial: 300, max: 5000, jitter: true },
      attempts: {
        max: 5,
        retryIf: (error, operation) => {
          const def = getMainDefinition(operation.query) as OperationDefinitionNode;
          if (def.kind === 'OperationDefinition' && def.operation === 'mutation') return false;
          return !!error;
        },
      },
    });

    const connectionReporter = new ApolloLink((operation, forward) => {
      if (!forward) return null;
      return asyncMap(forward(operation), (result) => {
        reportConnectionStatus(true, 'network');
        return result;
      });
    });

    return ApolloLink.from([retryLink, errorLogger, connectionReporter, hybridLink]);
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

    const httpLink = ApolloLink.split(this.shouldSkipBatch, unbatchedHttpLink, batchedHttpLink);

    const wsLink = subscriptionUri
      ? new WebSocketLink({ uri: subscriptionUri, options: { reconnect: true } })
      : undefined;

    const transport = wsLink ? createSplitLink(httpLink, wsLink) : httpLink;

    const retryLink = new RetryLink({
      delay: { initial: 300, max: 5000, jitter: true },
      attempts: {
        max: 5,
        retryIf: (error, operation) => {
          const def = getMainDefinition(operation.query) as OperationDefinitionNode;
          if (def.kind === 'OperationDefinition' && def.operation === 'mutation') return false;
          return !!error;
        },
      },
    });

    const errorLogger = onError((error) => {
      logError(error);
      if (error.networkError) reportConnectionStatus(false, 'network');
    });

    const connectionReporter = new ApolloLink((operation, forward) => {
      if (!forward) return null;
      return asyncMap(forward(operation), (result) => {
        reportConnectionStatus(true, 'network');
        return result;
      });
    });

    return ApolloLink.from([retryLink, errorLogger, connectionReporter, transport]);
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
    batchInterval: 10,
    batchMax: 10,
  };

  static async provider(_, config: GraphQLConfig) {
    return new GraphqlUI(config);
  }
}

GraphqlAspect.addRuntime(GraphqlUI);
