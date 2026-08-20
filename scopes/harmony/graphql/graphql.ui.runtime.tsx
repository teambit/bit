import type { ReactNode } from 'react';
import React from 'react';
import { UIRuntime } from '@teambit/ui';
import { BatchHttpLink } from '@apollo/client/link/batch-http';
import { InMemoryCache, ApolloClient, ApolloLink, HttpLink, Observable } from '@apollo/client';
import type { NormalizedCacheObject, Operation } from '@apollo/client';
import { WebSocketLink } from '@apollo/client/link/ws';
import { onError } from '@apollo/client/link/error';
import { RetryLink } from '@apollo/client/link/retry';
import { getMainDefinition } from '@apollo/client/utilities';
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

function sanitizeRestoredApolloCache(cacheData: NormalizedCacheObject) {
  let clearedServerField = 0;
  let clearedPreviewUrl = 0;
  let clearedCompilingFlag = 0;

  for (const key of Object.keys(cacheData)) {
    const entry = cacheData[key] as Record<string, any> | undefined;
    if (!entry || typeof entry !== 'object') continue;

    // `Component.server` is runtime-volatile by nature.
    // Keeping stale server blocks (url/isCompiling) across process restarts causes
    // false online states and stale preview readiness during cache hydration.
    if (entry.server && typeof entry.server === 'object') {
      delete entry.server;
      clearedServerField += 1;
    }

    if (entry.url && typeof entry.url === 'string' && entry.url.startsWith('/preview/')) {
      entry.url = null;
      clearedPreviewUrl += 1;
    }

    if (typeof entry.isCompiling === 'boolean') {
      delete entry.isCompiling;
      clearedCompilingFlag += 1;
    }
  }

  return { clearedServerField, clearedPreviewUrl, clearedCompilingFlag };
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
  /**
   * master switch for request batching, off by default (a workspace opts in). When enabled, batching is
   * still *per-operation opt-in*: only Apollo operations that set `context: { batch: true }` are coalesced
   * via BatchHttpLink; everything else goes through a plain HttpLink. When disabled (the default) NO
   * operation batches regardless of its context — a global opt-out for the whole workspace. Mutations
   * never batch. tune the batching window/cap via the fields below.
   */
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

        // Clear volatile preview-server state from restored cache.
        // We keep stable metadata (names/compositions/etc.) for instant render, but force
        // runtime preview readiness/compilation state to come from fresh network/session events.
        if (cacheEntries > 0) {
          const { clearedServerField, clearedPreviewUrl, clearedCompilingFlag } =
            sanitizeRestoredApolloCache(cacheData);
          const clearedTotal = clearedServerField + clearedPreviewUrl + clearedCompilingFlag;
          if (clearedTotal > 0) {
            cache.restore(cacheData);
            // eslint-disable-next-line no-console
            console.log(
              `[apollo-cache] sanitized volatile fields (server=${clearedServerField}, previewUrl=${clearedPreviewUrl}, isCompiling=${clearedCompilingFlag})`
            );
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

  // batch only when the workspace enabled batching (`enableBatching`, default off) AND the operation
  // opted in via `context: { batch: true }`. mutations never batch.
  private readonly shouldBatch = (op: Operation) => {
    if (!this.config.enableBatching) return false;
    const def = getMainDefinition(op.query) as OperationDefinitionNode;
    if (def.kind === 'OperationDefinition' && def.operation === 'mutation') return false;
    return op.getContext().batch === true;
  };

  private createConnectionReporterLink() {
    return new ApolloLink((operation, forward) => {
      if (!forward) return null;
      const observable = forward(operation);
      return new Observable((observer) => {
        const subscription = observable.subscribe({
          next: (result) => {
            reportConnectionStatus(true, 'network');
            observer.next(result);
          },
          error: (error) => observer.error(error),
          complete: () => observer.complete(),
        });

        return () => {
          subscription?.unsubscribe?.();
        };
      });
    });
  }

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

    const errorLogger = onError((error) => {
      logError(error);
      if (error.networkError) reportConnectionStatus(false, 'network');
    });

    const connectionReporter = this.createConnectionReporterLink();

    return ApolloLink.from([retryLink, errorLogger, connectionReporter, hybridLink]);
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
