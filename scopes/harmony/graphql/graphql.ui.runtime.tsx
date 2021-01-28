import React, { ReactNode } from 'react';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { UIRuntime } from '@teambit/ui';

import { InMemoryCache, ApolloClient, ApolloLink, HttpLink, createHttpLink } from '@apollo/client';
import type { NormalizedCacheObject, ApolloQueryResult, QueryOptions } from '@apollo/client';
import { WebSocketLink } from '@apollo/client/link/ws';
import { onError } from '@apollo/client/link/error';

import crossFetch from 'cross-fetch';

import { createSplitLink } from './create-link';
import { GraphQLProvider } from './graphql-provider';
import { GraphQLServer } from './graphql-server';
import { GraphqlAspect } from './graphql.aspect';
import { GraphqlRenderLifecycle } from './render-lifecycle';
import { logError } from './logging';

export type GraphQLServerSlot = SlotRegistry<GraphQLServer>;
/**
 * Type of gql client.
 * Used to abstract Apollo client, so consumers could import the type from graphql.ui, and not have to depend on @apollo/client directly
 * */
export type GraphQLClient<T> = ApolloClient<T>;

type ClientOptions = { state?: NormalizedCacheObject };

export class GraphqlUI {
  constructor(private remoteServerSlot: GraphQLServerSlot) {}

  private _client?: GraphQLClient<any>;

  /** @deprecated */
  get client() {
    if (!this._client) {
      this._client = this.createClient(window.location.host);
    }

    return this._client;
  }

  /** internal. Sets the global gql client */
  _setClient(client: GraphQLClient<any>) {
    this._client = client;
  }

  /** @deprecated */
  async query(options: QueryOptions): Promise<ApolloQueryResult<any>> {
    return this.client.query(options);
  }

  createClient(host: string, { state }: ClientOptions = {}) {
    const client = new ApolloClient({
      link: this.createLink(host),
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

  registerRemote(server: GraphQLServer) {
    this.remoteServerSlot.register(server);
  }

  private createCache({ state }: { state?: NormalizedCacheObject } = {}) {
    const cache = new InMemoryCache();

    if (state) cache.restore(state);

    return cache;
  }

  // unused
  createLinks() {
    const servers = this.remoteServerSlot.values();

    return servers.map((server) => {
      return this.createLink(server.uri);
    });
  }

  private createLink(host: string) {
    const httpLink = this.createHttpLink(host);
    const wsLink = this.createWsLink(host);
    const hybridLink = createSplitLink(httpLink, wsLink);
    const errorLogger = onError(logError);

    return ApolloLink.from([errorLogger, hybridLink]);
  }

  private createHttpLink(host: string) {
    return new HttpLink({
      credentials: 'include',
      uri: `${(window.location.protocol === 'https:' ? 'https://' : 'http://') + host}/graphql`,
    });
  }

  private createWsLink(host: string) {
    return new WebSocketLink({
      uri: `${(window.location.protocol === 'https:' ? 'wss://' : 'ws://') + host}/subscriptions`,
      options: {
        reconnect: true,
      },
    });
  }

  /**
   * get the graphQL provider
   */
  getProvider = ({ client = this.client, children }: { client?: GraphQLClient<any>; children: ReactNode }) => {
    return <GraphQLProvider client={client}>{children}</GraphQLProvider>;
  };

  renderHooks = new GraphqlRenderLifecycle(this);

  static dependencies = [];

  static runtime = UIRuntime;

  static slots = [Slot.withType<GraphQLServer>()];

  static async provider(deps, config, [serverSlot]: [GraphQLServerSlot]) {
    const graphqlUI = new GraphqlUI(serverSlot);

    return graphqlUI;
  }
}

GraphqlAspect.addRuntime(GraphqlUI);
